import {
  isGenerationJobSnapshot,
  type CreateGenerationJobResponse,
  type GenerationJobSnapshot,
} from '../../../../shared/generationJobs';
import type {GenerateRequest} from '../../../../shared/types';
import {ApiError, isGenerateResult, requestJson} from './api';

/** 任务接口为短请求：30 秒超时，不与同步生成接口的 10 分钟超时共用。 */
export const GENERATION_JOB_REQUEST_TIMEOUT_MS = 30_000;

const CREATE_FAILURE_MESSAGE = '任务创建失败，请稍后重试';
const GET_FAILURE_MESSAGE = '任务状态查询失败，请稍后重试';
const RESULT_INVALID_MESSAGE = '任务结果数据无效，请稍后重试';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCreateGenerationJobResponse(value: unknown): value is CreateGenerationJobResponse {
  return (
    isRecord(value)
    && isNonEmptyString(value.jobId)
    && value.status === 'queued'
    && isNonEmptyString(value.createdAt)
  );
}

/** 创建后台生成任务：立即返回 jobId，不等待模型生成。 */
export async function createGenerationJob(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<CreateGenerationJobResponse> {
  const body = await requestJson(
    '/api/generation-jobs',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(request),
    },
    CREATE_FAILURE_MESSAGE,
    signal,
    GENERATION_JOB_REQUEST_TIMEOUT_MS,
  );
  if (!isCreateGenerationJobResponse(body)) {
    throw new ApiError(200, CREATE_FAILURE_MESSAGE);
  }
  return body;
}

/** 查询任务快照：终态 result 需通过完整结果守卫。 */
export async function getGenerationJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<GenerationJobSnapshot> {
  const body = await requestJson(
    `/api/generation-jobs/${encodeURIComponent(jobId)}`,
    {method: 'GET'},
    GET_FAILURE_MESSAGE,
    signal,
    GENERATION_JOB_REQUEST_TIMEOUT_MS,
  );
  if (!isGenerationJobSnapshot(body)) {
    throw new ApiError(200, GET_FAILURE_MESSAGE);
  }
  if (
    (body.status === 'succeeded' || body.status === 'partial')
    && !isGenerateResult(body.result)
  ) {
    throw new ApiError(200, RESULT_INVALID_MESSAGE);
  }
  return body;
}
