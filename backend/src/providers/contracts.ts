import type {RemoteImageMediaType} from '../http/safeRemoteImage';

export interface TextJsonRequest {
  readonly system?: string;
  readonly prompt: string;
  /** Mock Provider 预置数据键；真实 Provider 忽略。 */
  readonly fixtureKey?: string;
}

export interface VisionJsonRequest {
  readonly prompt: string;
  /** 参考图 data URL，顺序即语义顺序。 */
  readonly imageDataUrls: string[];
  readonly fixtureKey?: string;
}

export interface ImageGenerationRequest {
  readonly prompt: string;
  readonly size: string;
}

export interface ImageEditRequest {
  readonly prompt: string;
  readonly size: string;
  /** 参考图 data URL，顺序即语义顺序。 */
  readonly imageDataUrls: string[];
}

export interface GeneratedImage {
  bytes: Buffer;
  mediaType: RemoteImageMediaType;
}

export interface TextProvider {
  generateJson(request: TextJsonRequest): Promise<unknown>;
}

export interface VisionProvider {
  generateJsonFromImages(request: VisionJsonRequest): Promise<unknown>;
}

export interface ImageProvider {
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
  edit(request: ImageEditRequest): Promise<GeneratedImage>;
}

export interface WebSearchRequest {
  readonly query: string;
  /** 期望返回的结果条数（1～50）。 */
  readonly count?: number;
  /** Mock Provider 预置数据键；真实 Provider 忽略。 */
  readonly fixtureKey?: string;
}

export interface WebSearchResultItem {
  readonly title: string;
  readonly content: string;
  readonly link: string;
  readonly media?: string;
  readonly publishDate?: string;
}

export interface WebSearchOutcome {
  readonly results: WebSearchResultItem[];
}

export interface SearchProvider {
  search(request: WebSearchRequest): Promise<WebSearchOutcome>;
}

export interface ProviderBundle {
  readonly text: TextProvider;
  readonly vision: VisionProvider;
  readonly image: ImageProvider;
  readonly search: SearchProvider;
}

export type MockFixtures = {
  text?: Record<string, unknown>;
  vision?: Record<string, unknown>;
  search?: Record<string, WebSearchOutcome>;
};
