/**
 * 统一业务错误：只携带安全的中文提示和稳定错误码。
 * 禁止把上游响应正文、密钥或物理路径放入 message。
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly safeMessage: string,
    public readonly code: string,
  ) {
    super(safeMessage);
    this.name = 'ApiError';
  }
}

export function toErrorResponse(error: unknown): {status: number; body: {error: string; code: string}} {
  if (error instanceof ApiError) {
    return {status: error.status, body: {error: error.safeMessage, code: error.code}};
  }
  return {status: 500, body: {error: '服务暂时不可用，请稍后重试', code: 'INTERNAL_ERROR'}};
}
