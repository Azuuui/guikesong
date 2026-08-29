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
const ACTIVE_JOB_FALLBACK_STORAGE_KEY = 'qianscape-generation-job-fallback';

const DATABASE_NAME = 'qianscape-generation-job';
const DATABASE_VERSION = 2;
const STORE_NAME = 'submission';
const RECORD_KEY = 'active';
const LOCK_STORE_NAME = 'locks';
const CREATION_LOCK_KEY = 'generation-start';
const CREATION_LEASE_MS = 45_000;
const CREATION_LOCK_WAIT_MS = 35_000;

interface GenerationJobDatabase extends DBSchema {
  submission: {
    key: string;
    value: ActiveGenerationSubmission;
  };
  locks: {
    key: string;
    value: {owner: string; expiresAt: number};
  };
}

async function openGenerationJobDatabase(): Promise<IDBPDatabase<GenerationJobDatabase>> {
  return openDB<GenerationJobDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore(STORE_NAME);
      if (oldVersion < 2) database.createObjectStore(LOCK_STORE_NAME);
    },
  });
}

function leaseOwner(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(bytes, value => value.toString(16)).join('-');
}

async function tryAcquireCreationLease(owner: string): Promise<boolean> {
  return withDatabase(async database => {
    const transaction = database.transaction(LOCK_STORE_NAME, 'readwrite');
    const current = await transaction.store.get(CREATION_LOCK_KEY);
    if (current && current.expiresAt > Date.now()) {
      await transaction.done;
      return false;
    }
    await transaction.store.put({owner, expiresAt: Date.now() + CREATION_LEASE_MS}, CREATION_LOCK_KEY);
    await transaction.done;
    return true;
  });
}

async function releaseCreationLease(owner: string): Promise<void> {
  await withDatabase(async database => {
    const transaction = database.transaction(LOCK_STORE_NAME, 'readwrite');
    const current = await transaction.store.get(CREATION_LOCK_KEY);
    if (current?.owner === owner) await transaction.store.delete(CREATION_LOCK_KEY);
    await transaction.done;
  }).catch(() => undefined);
}

/** Web Locks 不可用时，以 IndexedDB 原子事务提供跨标签创建互斥。 */
export async function withGenerationCreationLease<T>(action: () => Promise<T>): Promise<T> {
  const owner = leaseOwner();
  const deadline = Date.now() + CREATION_LOCK_WAIT_MS;
  while (!(await tryAcquireCreationLease(owner))) {
    if (Date.now() >= deadline) throw new Error('等待生成任务创建锁超时');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  try {
    return await action();
  } finally {
    await releaseCreationLease(owner);
  }
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
  const fallback = readFallbackSubmission();
  try {
    const stored = await withDatabase(database => database.get(STORE_NAME, RECORD_KEY));
    if (stored && (!fallback || stored.jobId === fallback.jobId)) return stored;
  } catch {
    // IndexedDB 可能被隐私模式或配额策略禁用，继续读取轻量降级记录。
  }
  return fallback;
}

function readFallbackSubmission(): ActiveGenerationSubmission | undefined {
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_FALLBACK_STORAGE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<ActiveGenerationSubmission>;
    if (
      typeof value.jobId !== 'string'
      || typeof value.userPrompt !== 'string'
      || typeof value.createdAt !== 'string'
      || typeof value.historySaved !== 'boolean'
      || typeof value.request !== 'object'
      || value.request === null
    ) return undefined;
    return {...value, referenceFiles: []} as ActiveGenerationSubmission;
  } catch {
    return undefined;
  }
}

function writeFallbackSubmission(submission: ActiveGenerationSubmission): void {
  try {
    const {referenceFiles: _referenceFiles, ...fallback} = submission;
    localStorage.setItem(ACTIVE_JOB_FALLBACK_STORAGE_KEY, JSON.stringify(fallback));
    localStorage.setItem(ACTIVE_JOB_ID_STORAGE_KEY, submission.jobId);
  } catch {
    // localStorage 也可能被浏览器策略禁用；此时仍继续尝试 IndexedDB。
  }
}

/** 保存活动提交上下文并同步快速发现键。 */
async function putSubmission(input: ActiveGenerationSubmissionInput): Promise<ActiveGenerationSubmission> {
  const submission: ActiveGenerationSubmission = {
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  // 先写轻量降级记录：后端一旦接单，即使 IndexedDB 不可用也能在刷新后找回 jobId。
  writeFallbackSubmission(submission);
  try {
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
  } catch {
    // 当前任务继续轮询；完整参考图副本仍由历史保存流程单独处理并提示失败。
  }
  return submission;
}

/** 标记当前活动任务的历史已保存（幂等；jobId 不匹配时不生效）。 */
async function markHistorySaved(jobId: string): Promise<void> {
  const fallback = readFallbackSubmission();
  if (fallback?.jobId === jobId) writeFallbackSubmission({...fallback, historySaved: true});
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
  }).catch(() => undefined);
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
  }).catch(() => undefined);
  try {
    localStorage.removeItem(ACTIVE_JOB_ID_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_JOB_FALLBACK_STORAGE_KEY);
  } catch {
    // 浏览器禁用 localStorage 时，IndexedDB 清理成功已足够。
  }
}

/** 快速发现活动 jobId：避免无任务时也打开 IndexedDB。 */
export function readActiveJobId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_JOB_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const generationJobRepository = {
  get: (): Promise<ActiveGenerationSubmission | undefined> => getSubmission(),
  put: (input: ActiveGenerationSubmissionInput): Promise<ActiveGenerationSubmission> =>
    putSubmission(input),
  markHistorySaved: (jobId: string): Promise<void> => markHistorySaved(jobId),
  clear: (): Promise<void> => clearSubmission(),
};
