import type {GenerationJobProgress} from '../../../shared/generationJobs';
import type {GenerateRequest, GenerateResult} from '../../../shared/workflows';
import {ApiError} from '../http/apiError';
import type {GenerationJobStore} from '../storage/generationJobStore';
import type {WorkflowRegistry} from '../workflows/registry';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 后台生成任务执行器：queued → running → 终态（succeeded/partial/failed）。
 * 进度事件实时落盘；任何异常在内部收敛为安全 failed 终态，
 * 调用方可安全使用 `void runner.start(...)`，不会产生未处理 Promise rejection。
 */
export class GenerationJobRunner {
  private readonly startedJobIds = new Set<string>();

  constructor(
    private readonly store: GenerationJobStore,
    private readonly registry: WorkflowRegistry,
  ) {}

  /** 启动任务并等待终态落盘；同一 jobId 只执行一次。 */
  async start(jobId: string, request: GenerateRequest): Promise<void> {
    if (this.startedJobIds.has(jobId)) return;
    this.startedJobIds.add(jobId);

    try {
      await this.store.update(jobId, current => ({
        ...current,
        snapshot: {
          ...current.snapshot,
          status: 'running',
          updatedAt: nowIso(),
        },
      }));

      const workflow = this.registry.get(request.workflowId);
      const result = await workflow.run(request, {
        requestId: jobId,
        reportProgress: progress => this.saveProgress(jobId, progress),
      });

      await this.saveResult(jobId, result);
    } catch (error) {
      await this.saveFailure(jobId, error);
    }
  }

  private async saveProgress(jobId: string, progress: GenerationJobProgress): Promise<void> {
    try {
      await this.store.update(jobId, current => ({
        ...current,
        snapshot: {
          ...current.snapshot,
          status: 'running',
          phase: progress.phase,
          ...(progress.completedImages === undefined
            ? {}
            : {completedImages: progress.completedImages}),
          ...(progress.totalImages === undefined ? {} : {totalImages: progress.totalImages}),
          updatedAt: nowIso(),
        },
      }));
    } catch (error) {
      // 进度更新失败（如任务文件被清理）不中断生成，终态写入仍会尝试。
      console.warn('[generation-job-runner] 进度更新失败', {
        jobId,
        code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
      });
    }
  }

  private async saveResult(jobId: string, result: GenerateResult): Promise<void> {
    const status = result.status === 'partial' ? 'partial' : 'succeeded';
    await this.store.update(jobId, current => ({
      ...current,
      snapshot: {
        ...current.snapshot,
        status,
        phase: 'finalizing',
        result,
        error: null,
        updatedAt: nowIso(),
      },
    }));
  }

  private async saveFailure(jobId: string, error: unknown): Promise<void> {
    const jobError = error instanceof ApiError
      ? {code: error.code, message: error.safeMessage}
      : {code: 'INTERNAL_ERROR', message: '生成失败，请稍后重试'};
    try {
      await this.store.update(jobId, current => ({
        ...current,
        snapshot: {
          ...current.snapshot,
          status: 'failed',
          result: null,
          error: jobError,
          updatedAt: nowIso(),
        },
      }));
    } catch (updateError) {
      // 任务文件已不存在（如过期清理）时无处可写，记录后结束。
      if (updateError instanceof ApiError && updateError.code === 'JOB_NOT_FOUND') return;
      console.error('[generation-job-runner] 保存失败终态时出错', {
        jobId,
        code: jobError.code,
      });
    }
  }
}
