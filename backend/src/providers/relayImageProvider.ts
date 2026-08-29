import {ApiError} from '../http/apiError';
import {fetchRemoteImage, type RemoteImageMediaType} from '../http/safeRemoteImage';
import {fetchWithTimeout, type FetchLike} from '../http/fetchWithTimeout';
import {IMAGE_TIMEOUT_MS, mapTransportError, mapUpstreamStatus} from './upstream';
import type {GeneratedImage, ImageEditRequest, ImageGenerationRequest, ImageProvider} from './contracts';

export interface RelayImageProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
  /** 域名解析函数，测试注入用。 */
  lookup?: (hostname: string) => Promise<{address: string}>;
}

interface RelayImageItem {
  b64_json?: unknown;
  url?: unknown;
}

const EXT_BY_MEDIA_TYPE: Record<RemoteImageMediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function parseDataUrl(dataUrl: string): {bytes: Buffer; mediaType: RemoteImageMediaType} {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new ApiError(502, '参考图数据无效', 'INVALID_REFERENCE_IMAGE');
  }
  const mediaType = match[1] as RemoteImageMediaType;
  return {bytes: Buffer.from(match[2], 'base64'), mediaType};
}

/** 中转站生图 Provider：gpt-image-2 文生图与多参考图 edits。 */
export class RelayImageProvider implements ImageProvider {
  constructor(private readonly config: RelayImageProviderConfig) {}

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const body = {
      model: this.config.model,
      prompt: request.prompt,
      size: request.size,
      n: 1,
    };

    const payload = await this.postJson(`${this.config.baseUrl}/images/generations`, body);
    return this.toGeneratedImage(payload);
  }

  async edit(request: ImageEditRequest): Promise<GeneratedImage> {
    const form = new FormData();
    form.append('model', this.config.model);
    form.append('prompt', request.prompt);
    form.append('size', request.size);
    form.append('n', '1');

    // FormData append 顺序即参考图语义顺序
    request.imageDataUrls.forEach((dataUrl, index) => {
      const {bytes, mediaType} = parseDataUrl(dataUrl);
      form.append(
        'image',
        new Blob([new Uint8Array(bytes)], {type: mediaType}),
        `reference-${index}.${EXT_BY_MEDIA_TYPE[mediaType]}`,
      );
    });

    const payload = await this.postForm(`${this.config.baseUrl}/images/edits`, form);
    return this.toGeneratedImage(payload);
  }

  private async postJson(url: string, body: unknown): Promise<{data?: RelayImageItem[]}> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
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
      throw mapTransportError(error, '图片生成超时，请稍后重试');
    }
    if (!response.ok) {
      throw mapUpstreamStatus(response.status);
    }
    return (await response.json()) as {data?: RelayImageItem[]};
  }

  private async postForm(url: string, form: FormData): Promise<{data?: RelayImageItem[]}> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {authorization: `Bearer ${this.config.apiKey}`},
          body: form,
        },
        IMAGE_TIMEOUT_MS,
        this.config.fetchImpl,
      );
    } catch (error) {
      throw mapTransportError(error, '图片生成超时，请稍后重试');
    }
    if (!response.ok) {
      throw mapUpstreamStatus(response.status);
    }
    return (await response.json()) as {data?: RelayImageItem[]};
  }

  private async toGeneratedImage(payload: {data?: RelayImageItem[]}): Promise<GeneratedImage> {
    const item = payload?.data?.[0];
    if (!item) {
      throw new ApiError(502, '生成服务未返回图片', 'UPSTREAM_EMPTY_IMAGE');
    }
    if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
      return {bytes: Buffer.from(item.b64_json, 'base64'), mediaType: 'image/png'};
    }
    if (typeof item.url === 'string' && item.url.length > 0) {
      // 统一转成本地字节数据，不透传第三方临时 URL
      const remote = await fetchRemoteImage(item.url, {
        fetchImpl: this.config.fetchImpl,
        lookup: this.config.lookup,
      });
      return {bytes: remote.bytes, mediaType: remote.mediaType};
    }
    throw new ApiError(502, '生成服务未返回图片', 'UPSTREAM_EMPTY_IMAGE');
  }
}
