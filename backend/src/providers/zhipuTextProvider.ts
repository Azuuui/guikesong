import {ApiError} from '../http/apiError';
import {fetchWithTimeout, type FetchLike} from '../http/fetchWithTimeout';
import {extractJson, mapTransportError, mapUpstreamStatus, TEXT_TIMEOUT_MS} from './upstream';
import type {TextJsonRequest, TextProvider} from './contracts';

export interface ZhipuTextProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
}

/** 智谱文案 Provider：glm-5.3-flash，reasoning_effort 固定 low。 */
export class ZhipuTextProvider implements TextProvider {
  constructor(private readonly config: ZhipuTextProviderConfig) {}

  async generateJson(request: TextJsonRequest): Promise<unknown> {
    const body = {
      model: this.config.model,
      messages: [
        ...(request.system ? [{role: 'system', content: request.system}] : []),
        {role: 'user', content: request.prompt},
      ],
      thinking: {type: 'enabled'},
      reasoning_effort: 'low',
      stream: false,
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        TEXT_TIMEOUT_MS,
        this.config.fetchImpl,
      );
    } catch (error) {
      throw mapTransportError(error, '文案生成超时，请稍后重试');
    }

    if (!response.ok) {
      throw mapUpstreamStatus(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(502, '生成服务返回了无法解析的内容', 'UPSTREAM_INVALID_RESPONSE');
    }

    const content = (payload as {choices?: Array<{message?: {content?: unknown}}>} | null)?.choices?.[0]
      ?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new ApiError(502, '生成服务返回了空内容', 'UPSTREAM_EMPTY_CONTENT');
    }

    return extractJson(content);
  }
}
