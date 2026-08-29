import {ApiError} from '../http/apiError';
import {fetchWithTimeout, type FetchLike} from '../http/fetchWithTimeout';
import {
  clampSearchCount,
  mapTransportError,
  mapUpstreamStatus,
  SEARCH_TIMEOUT_MS,
} from './upstream';
import type {SearchProvider, WebSearchOutcome, WebSearchRequest, WebSearchResultItem} from './contracts';

export const DEFAULT_SEARCH_ENGINE = 'search_pro';

export interface ZhipuSearchProviderConfig {
  baseUrl: string;
  apiKey: string;
  /** 搜索引擎；缺省 search_pro。 */
  searchEngine?: string;
  fetchImpl?: FetchLike;
}

interface ZhipuSearchItem {
  title?: unknown;
  content?: unknown;
  link?: unknown;
  media?: unknown;
  publish_date?: unknown;
}

function toResultItem(item: ZhipuSearchItem): WebSearchResultItem | undefined {
  const {title, content, link} = item;
  if (typeof title !== 'string' || title.length === 0) return undefined;
  if (typeof content !== 'string' || content.length === 0) return undefined;
  if (typeof link !== 'string' || link.length === 0) return undefined;
  return {
    title,
    content,
    link,
    ...(typeof item.media === 'string' && item.media.length > 0 ? {media: item.media} : {}),
    ...(typeof item.publish_date === 'string' && item.publish_date.length > 0
      ? {publishDate: item.publish_date}
      : {}),
  };
}

/** 智谱网络搜索 Provider：web_search 工具 API，与文案模型共用密钥。 */
export class ZhipuSearchProvider implements SearchProvider {
  constructor(private readonly config: ZhipuSearchProviderConfig) {}

  async search(request: WebSearchRequest): Promise<WebSearchOutcome> {
    const body = {
      search_query: request.query,
      search_engine: this.config.searchEngine ?? DEFAULT_SEARCH_ENGINE,
      count: clampSearchCount(request.count),
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${this.config.baseUrl}/web_search`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        SEARCH_TIMEOUT_MS,
        this.config.fetchImpl,
      );
    } catch (error) {
      throw mapTransportError(error, '搜索服务超时，请稍后重试');
    }

    if (!response.ok) {
      throw mapUpstreamStatus(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(502, '搜索服务返回了无法解析的内容', 'UPSTREAM_INVALID_RESPONSE');
    }

    const rawItems = (payload as {search_result?: unknown} | null)?.search_result;
    if (!Array.isArray(rawItems)) {
      throw new ApiError(502, '搜索服务返回了无法解析的内容', 'UPSTREAM_INVALID_RESPONSE');
    }

    const results = rawItems
      .map((item): WebSearchResultItem | undefined =>
        toResultItem((item ?? {}) as ZhipuSearchItem),
      )
      .filter((item): item is WebSearchResultItem => item !== undefined);
    return {results};
  }
}
