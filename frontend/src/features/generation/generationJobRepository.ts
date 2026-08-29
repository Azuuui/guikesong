import {openDB, type DBSchema, type IDBPDatabase} from 'idb';
import type {GenerateRequest} from '../../../../shared/types';
import type {StoredReferenceFile} from '../history/historyTypes';

/**
 * 活动生成任务上下文：刷新后恢复轮询与历史保存所需的全部信息。
 * 任务本身的状态以后端任务接口为准；本地只保存提交上下文和参考图 Blob。
 */
export interface ActiveGenerationSubmission {
  jobId: string;
  request: GenerateRequest;
  userPrompt: string;
  referenceFiles: StoredReferenceFile[];
  createdAt: string;
  historySaved: boolean;
}

export type ActiveGenerationSubmissionInput = Omit<ActiveGenerationSubmission, 'createdAt'> & {
  createdAt?: string;
};

/** localStorage 只保存活动 jobId 用于快速发现，不保存 Blob。 */
export const ACTIVE_JOB_ID_STORAGE_KEY = 'qianscape-generation-job-id';

const DATABASE_NAME = 'qianscape-generation-job';
const DATABASE_VERSION = 1;
const STORE_NAME = 'submission';
const RECORD_KEY = 'active';

interface GenerationJobDatabase extends DBSchema {
  submission: {
    key: string;
    value: ActiveGenerationSubmission;
  };
}

async function openGenerationJobDatabase(): Promise<IDBPDatabase<GenerationJobDatabase>> {
  return openDB<GenerationJobDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      database.createObjectStore(STORE_NAME);
    },
  });
}

async function withDatabase<T>(
  operation: (database: IDBPDatabase<GenerationJobDatabase>) => Promise<T>,
): Promise<T> {
  const database = await openGenerationJobDatabase();
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

/** 读活动提交上下文；无活动任务时返回 undefined。 */
async function getSubmission(): Promise<ActiveGenerationSubmission | undefined> {
  return withDatabase(database => database.get(STORE_NAME, RECORD_KEY));
}

/** 保存活动提交上下文并同步快速发现键。 */
async function putSubmission(input: ActiveGenerationSubmissionInput): Promise<ActiveGenerationSubmission> {
  const submission: ActiveGenerationSubmission = {
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  await withDatabase(async database => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    try {
      await transaction.store.put(submission, RECORD_KEY);
      await transaction.done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The browser may already have aborted a failed transaction.
      }
      await transaction.done.catch(() => undefined);
      throw error;
    }
  });
  localStorage.setItem(ACTIVE_JOB_ID_STORAGE_KEY, submission.jobId);
  return submission;
}

/** 标记当前活动任务的历史已保存（幂等；jobId 不匹配时不生效）。 */
async function markHistorySaved(jobId: string): Promise<void> {
  await withDatabase(async database => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    try {
      const current = await transaction.store.get(RECORD_KEY);
      if (current && current.jobId === jobId) {
        await transaction.store.put({...current, historySaved: true}, RECORD_KEY);
      }
      await transaction.done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The browser may already have aborted a failed transaction.
      }
      await transaction.done.catch(() => undefined);
      throw error;
    }
  });
}

/** 清空活动任务上下文与快速发现键。 */
async function clearSubmission(): Promise<void> {
  await withDatabase(async database => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    try {
      await transaction.store.delete(RECORD_KEY);
      await transaction.done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The browser may already have aborted a failed transaction.
      }
      await transaction.done.catch(() => undefined);
      throw error;
    }
  });
  localStorage.removeItem(ACTIVE_JOB_ID_STORAGE_KEY);
}

/** 快速发现活动 jobId：避免无任务时也打开 IndexedDB。 */
export function readActiveJobId(): string | null {
  return localStorage.getItem(ACTIVE_JOB_ID_STORAGE_KEY);
}

export const generationJobRepository = {
  get: (): Promise<ActiveGenerationSubmission | undefined> => getSubmission(),
  put: (input: ActiveGenerationSubmissionInput): Promise<ActiveGenerationSubmission> =>
    putSubmission(input),
  markHistorySaved: (jobId: string): Promise<void> => markHistorySaved(jobId),
  clear: (): Promise<void> => clearSubmission(),
};
