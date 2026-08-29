import {ApiError} from '../http/apiError';

export const TEXT_TIMEOUT_MS = 30_000;
export const IMAGE_TIMEOUT_MS = 180_000;

export function isHttpTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as {name?: unknown}).name === 'HttpTimeoutError'
  );
}

export function mapTransportError(error: unknown, timeoutMessage: string): ApiError {
  if (isHttpTimeoutError(error)) {
    return new ApiError(504, timeoutMessage, 'UPSTREAM_TIMEOUT');
  }
  return new ApiError(502, '生成服务暂时不可用，请稍后重试', 'UPSTREAM_ERROR');
}

export function mapUpstreamStatus(status: number): ApiError {
  if (status === 429) {
    return new ApiError(429, '请求过于频繁，请稍后重试', 'UPSTREAM_RATE_LIMIT');
  }
  if (status >= 500) {
    return new ApiError(502, '生成服务暂时不可用，请稍后重试', 'UPSTREAM_ERROR');
  }
  return new ApiError(502, '生成请求被拒绝，请稍后重试', 'UPSTREAM_REJECTED');
}

/** 从模型输出中提取 JSON：容忍 markdown 围栏与前后杂讯。 */
export function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? content).trim();
  const start = candidate.indexOf('{');
  const arrayStart = candidate.indexOf('[');
  const begin =
    start === -1 ? arrayStart : arrayStart === -1 ? start : Math.min(start, arrayStart);
  if (begin === -1) {
    throw new ApiError(502, '生成内容不是有效 JSON', 'UPSTREAM_INVALID_JSON');
  }
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  try {
    return JSON.parse(candidate.slice(begin, end + 1));
  } catch {
    throw new ApiError(502, '生成内容不是有效 JSON', 'UPSTREAM_INVALID_JSON');
  }
}
