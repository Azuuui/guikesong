import {ApiError} from '../http/apiError';
import {fetchWithTimeout, type FetchLike} from '../http/fetchWithTimeout';
import {extractJson, IMAGE_TIMEOUT_MS, mapTransportError, mapUpstreamStatus} from './upstream';
import type {VisionJsonRequest, VisionProvider} from './contracts';

export interface RelayVisionProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
}

/** 中转站视觉理解 Provider：gpt-image-2 多图输入返回 JSON。 */
export class RelayVisionProvider implements VisionProvider {
  constructor(private readonly config: RelayVisionProviderConfig) {}

  async generateJsonFromImages(request: VisionJsonRequest): Promise<unknown> {
    const content = [
      {type: 'text', text: request.prompt},
      ...request.imageDataUrls.map(url => ({type: 'image_url', image_url: {url}})),
    ];
    const body = {
      model: this.config.model,
      messages: [{role: 'user', content}],
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
        IMAGE_TIMEOUT_MS,
        this.config.fetchImpl,
      );
    } catch (error) {
      throw mapTransportError(error, '图片理解超时，请稍后重试');
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

    const contentText = (payload as {choices?: Array<{message?: {content?: unknown}}>} | null)
      ?.choices?.[0]?.message?.content;
    if (typeof contentText !== 'string' || contentText.length === 0) {
      throw new ApiError(502, '生成服务返回了空内容', 'UPSTREAM_EMPTY_CONTENT');
    }

    return extractJson(contentText);
  }
}
