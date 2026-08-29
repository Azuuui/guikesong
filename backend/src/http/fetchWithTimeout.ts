export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class HttpTimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'HttpTimeoutError';
  }
}

/** 带超时的 fetch：超时通过 AbortController 中断并抛出 HttpTimeoutError。 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {...init, signal: controller.signal});
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpTimeoutError('请求超时', timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
