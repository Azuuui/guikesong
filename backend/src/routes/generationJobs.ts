import {randomUUID} from 'node:crypto';
import type {Express, Request, Response} from 'express';
import {parseGenerateRequest, WorkflowValidationError} from '../../../shared/workflowSchemas';
import {ApiError} from '../http/apiError';
import type {GenerationJobRunner} from '../services/generationJobRunner';
import type {GenerationJobStore} from '../storage/generationJobStore';

export interface GenerationJobRouteDependencies {
  readonly store: GenerationJobStore;
  readonly runner: GenerationJobRunner;
}

/**
 * 后台生成任务接口：
 * POST /api/generation-jobs 立即返回 202 与 jobId，不等待模型生成；
 * GET  /api/generation-jobs/:jobId 返回任务快照供前端轮询。
 */
export function registerGenerationJobRoutes(app: Express, deps: GenerationJobRouteDependencies): void {
  app.post('/api/generation-jobs', async (req: Request, res: Response) => {
    let request;
    try {
      request = parseGenerateRequest(req.body);
    } catch (error) {
      if (error instanceof WorkflowValidationError) {
        throw new ApiError(400, error.message, error.code);
      }
      throw error;
    }

    const jobId = randomUUID();
    const record = await deps.store.create({jobId, request});
    res.status(202).json({
      jobId: record.snapshot.jobId,
      status: record.snapshot.status,
      createdAt: record.snapshot.createdAt,
    });
    queueMicrotask(() => {
      void deps.runner.start(jobId, request);
    });
  });

  app.get('/api/generation-jobs/:jobId', async (req: Request, res: Response) => {
    const {jobId} = req.params;
    if (typeof jobId !== 'string') {
      throw new ApiError(404, '任务不存在或已过期', 'JOB_NOT_FOUND');
    }
    const record = await deps.store.get(jobId);
    if (!record) {
      throw new ApiError(404, '任务不存在或已过期', 'JOB_NOT_FOUND');
    }
    res.json(record.snapshot);
  });
}
