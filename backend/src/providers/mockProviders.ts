import sharp from 'sharp';
import {ApiError} from '../http/apiError';
import type {
  GeneratedImage,
  ImageEditRequest,
  ImageGenerationRequest,
  ImageProvider,
  TextJsonRequest,
  TextProvider,
  VisionJsonRequest,
  VisionProvider,
} from './contracts';

function fixtureOrThrow(fixtures: Record<string, unknown>, fixtureKey: string | undefined): unknown {
  if (fixtureKey === undefined || !(fixtureKey in fixtures)) {
    throw new ApiError(500, 'Mock 数据缺失，请补充测试预置数据', 'MOCK_FIXTURE_MISSING');
  }
  return fixtures[fixtureKey];
}

/** Mock 文案 Provider：按 fixtureKey 返回深拷贝预置 JSON，绝不触网。 */
export class MockTextProvider implements TextProvider {
  constructor(private readonly fixtures: Record<string, unknown> = {}) {}

  async generateJson(request: TextJsonRequest): Promise<unknown> {
    return structuredClone(fixtureOrThrow(this.fixtures, request.fixtureKey));
  }
}

/** Mock 视觉 Provider：按 fixtureKey 返回深拷贝预置 JSON。 */
export class MockVisionProvider implements VisionProvider {
  constructor(private readonly fixtures: Record<string, unknown> = {}) {}

  async generateJsonFromImages(request: VisionJsonRequest): Promise<unknown> {
    return structuredClone(fixtureOrThrow(this.fixtures, request.fixtureKey));
  }
}

function parseSize(size: string): {width: number; height: number} {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return {width: 1024, height: 1024};
  return {width: Number(match[1]), height: Number(match[2])};
}

/** Mock 生图 Provider：确定性 SVG 占位图转 PNG，同输入同输出。 */
export class MockImageProvider implements ImageProvider {
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    return this.render(request.prompt, request.size, 0);
  }

  async edit(request: ImageEditRequest): Promise<GeneratedImage> {
    return this.render(request.prompt, request.size, request.imageDataUrls.length);
  }

  private async render(prompt: string, size: string, referenceCount: number): Promise<GeneratedImage> {
    const {width, height} = parseSize(size);
    const label = prompt.slice(0, 40).replace(/[<>&"]/g, '');
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<rect width="100%" height="100%" fill="#f3efe6"/>` +
        `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#0f766e" stroke-width="6" stroke-dasharray="18 12"/>` +
        `<text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-size="42" fill="#134e4a">${label}</text>` +
        `<text x="50%" y="56%" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#5f6f6d">Mock 占位图 · ${width}×${height} · 参考 ${referenceCount} 张</text>` +
        `</svg>`,
      'utf8',
    );
    const bytes = await sharp(svg).png().toBuffer();
    return {bytes, mediaType: 'image/png'};
  }
}
