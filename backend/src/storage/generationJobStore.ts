import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  isGenerationJobSnapshot,
  type GenerationJobSnapshot,
} from '../../../shared/generationJobs';
import {parseGenerateRequest} from '../../../shared/workflowSchemas';
import type {GenerateRequest} from '../../../shared/workflows';
import {ApiError} from '../http/apiError';

export type GenerationJobRecord = {
  request: GenerateRequest;
  snapshot: GenerationJobSnapshot;
};

export type GenerationJobStoreOptions = {
  /** 可注入时钟，测试控制过期。 */
  now?: () => Date;
  /** 任务保留时长；默认 24 小时。 */
  retentionMs?: number;
};

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
/** jobId 只允许字母数字与中划线，防止路径穿越与隐藏文件。 */
const SAFE_JOB_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;

function assertSafeJobId(jobId: string): void {
  if (!SAFE_JOB_ID.test(jobId)) {
    throw new ApiError(404, '任务不存在或已过期', 'JOB_NOT_FOUND');
  }
}

function snapshotFile(baseDir: string, jobId: string): string {
  return path.join(baseDir, `${jobId}.json`);
}

/** 校验恢复的记录：request 经请求 schema，snapshot 经共享守卫。 */
function isValidRecord(value: unknown, jobId: string): value is GenerationJobRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as {request?: unknown; snapshot?: unknown};
  try {
    parseGenerateRequest(record.request);
  } catch {
    return false;
  }
  if (!isGenerationJobSnapshot(record.snapshot)) return false;
  return record.snapshot.jobId === jobId;
}

/**
 * 后台生成任务的短期文件存储：data/generation-jobs/<jobId>.json。
 * 写入使用同目录临时文件 + 原子重命名；任务不是长期业务历史，
 * 超过保留期后由启动清理移除。
 */
export class GenerationJobStore {
  readonly ready: Promise<void>;
  private readonly baseDir: string;
  private readonly now: () => Date;
  private readonly retentionMs: number;
  private readonly updateQueues = new Map<string, Promise<void>>();

  constructor(baseDir: string, options: GenerationJobStoreOptions = {}) {
    this.baseDir = baseDir;
    this.now = options.now ?? (() => new Date());
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(this.baseDir, {recursive: true});
    await this.recoverInterruptedFiles();
    await this.cleanupFiles();
  }

  /** 目录下全部任务文件名（不含扩展名）。 */
  private async listJobIds(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      return files.filter(file => file.endsWith('.json')).map(file => file.slice(0, -'.json'.length));
    } catch {
      return [];
    }
  }

  private async readRecord(jobId: string): Promise<GenerationJobRecord | undefined> {
    try {
      const raw = await fs.readFile(snapshotFile(this.baseDir, jobId), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isValidRecord(parsed, jobId)) return parsed;
      console.warn('[generation-job-store] 损坏的任务文件已移除', {jobId});
      await fs.rm(snapshotFile(this.baseDir, jobId), {force: true});
      return undefined;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      if (error instanceof SyntaxError) {
        console.warn('[generation-job-store] 任务文件 JSON 损坏，已移除', {jobId});
        await fs.rm(snapshotFile(this.baseDir, jobId), {force: true});
        return undefined;
      }
      throw error;
    }
  }

  private async writeRecord(record: GenerationJobRecord): Promise<void> {
    const target = snapshotFile(this.baseDir, record.snapshot.jobId);
    const temp = path.join(this.baseDir, `${record.snapshot.jobId}.${randomUUID()}.tmp`);
    await fs.mkdir(this.baseDir, {recursive: true});
    await fs.writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await fs.rename(temp, target);
  }

  async create(input: {jobId: string; request: GenerateRequest}): Promise<GenerationJobRecord> {
    await this.ready;
    assertSafeJobId(input.jobId);
    // 长期运行的服务也按创建节奏清理，避免只在重启时释放过期任务。
    await this.cleanupFiles();
    const now = this.now().toISOString();
    const record: GenerationJobRecord = {
      request: input.request,
      snapshot: {
        jobId: input.jobId,
        workflowId: input.request.workflowId,
        status: 'queued',
        phase: 'preparing',
        completedImages: 0,
        totalImages: 0,
        createdAt: now,
        updatedAt: now,
        result: null,
        error: null,
      },
    };
    await this.writeRecord(record);
    return record;
  }

  async get(jobId: string): Promise<GenerationJobRecord | undefined> {
    await this.ready;
    if (!SAFE_JOB_ID.test(jobId)) return undefined;
    return this.readRecord(jobId);
  }

  async update(
    jobId: string,
    mutate: (current: GenerationJobRecord) => GenerationJobRecord,
  ): Promise<GenerationJobRecord> {
    await this.ready;
    assertSafeJobId(jobId);
    const previous = this.updateQueues.get(jobId) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const current = await this.readRecord(jobId);
      if (!current) {
        throw new ApiError(404, '任务不存在或已过期', 'JOB_NOT_FOUND');
      }
      const next = mutate(current);
      await this.writeRecord(next);
      return next;
    });
    const settled = operation.then(() => undefined, () => undefined);
    this.updateQueues.set(jobId, settled);
    try {
      return await operation;
    } finally {
      if (this.updateQueues.get(jobId) === settled) this.updateQueues.delete(jobId);
    }
  }

  /** 将启动时遗留的非终态任务收敛为安全失败终态。 */
  async recoverInterrupted(): Promise<void> {
    await this.ready;
    await this.recoverInterruptedFiles();
  }

  private async recoverInterruptedFiles(): Promise<void> {
    const jobIds = await this.listJobIds();
    for (const jobId of jobIds) {
      const record = await this.readRecord(jobId);
      if (!record) continue;
      const {status} = record.snapshot;
      if (status !== 'queued' && status !== 'running') continue;
      await this.writeRecord({
        ...record,
        snapshot: {
          ...record.snapshot,
          status: 'failed',
          result: null,
          error: {code: 'JOB_INTERRUPTED', message: '生成任务已中断，请重新生成'},
        },
      });
    }
  }

  /** 删除超过保留期的任务文件（按创建时间判断，与状态无关）。 */
  async cleanup(): Promise<void> {
    await this.ready;
    await this.cleanupFiles();
  }

  private async cleanupFiles(): Promise<void> {
    const cutoff = this.now().getTime() - this.retentionMs;
    const jobIds = await this.listJobIds();
    for (const jobId of jobIds) {
      const record = await this.readRecord(jobId);
      if (!record) continue;
      if (Date.parse(record.snapshot.createdAt) >= cutoff) continue;
      await fs.rm(snapshotFile(this.baseDir, jobId), {force: true});
    }
  }
}
