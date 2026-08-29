import {ApiError} from '../http/apiError';
import type {SearchProvider, WebSearchOutcome, WebSearchRequest} from './contracts';

/** 搜索不可用 Provider：搜索密钥未配置时占位，调用即抛安全业务错误，供上层降级。 */
export class UnavailableSearchProvider implements SearchProvider {
  async search(_request: WebSearchRequest): Promise<WebSearchOutcome> {
    throw new ApiError(503, '搜索服务未配置', 'SEARCH_UNAVAILABLE');
  }
}
