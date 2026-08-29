import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const EXT_BY_MEDIA_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

const MEDIA_TYPE_BY_EXT: Record<string, keyof typeof EXT_BY_MEDIA_TYPE> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export type StoredImageMediaType = keyof typeof EXT_BY_MEDIA_TYPE;

export interface StoredImageAsset {
  assetId: string;
  filename: string;
  mediaType: StoredImageMediaType;
  /** 形如 /api/generated-assets/{assetId}.{ext}，不含物理路径。 */
  url: string;
}

const FILENAME_PATTERN = /^[\w-]+\.(png|jpg|webp)$/;

/** 生成资产存储：真实 Provider 产出的图片落盘于此。 */
export class AssetStore {
  constructor(private readonly baseDir: string) {}

  async saveImage(buffer: Buffer, mediaType: StoredImageMediaType): Promise<StoredImageAsset> {
    await fs.mkdir(this.baseDir, {recursive: true});
    const assetId = randomUUID();
    const filename = `${assetId}.${EXT_BY_MEDIA_TYPE[mediaType]}`;
    await fs.writeFile(path.join(this.baseDir, filename), buffer);
    return {assetId, filename, mediaType, url: `/api/generated-assets/${filename}`};
  }

  async readImage(filename: string): Promise<{buffer: Buffer; mediaType: StoredImageMediaType} | null> {
    if (!FILENAME_PATTERN.test(filename)) return null;
    try {
      const buffer = await fs.readFile(path.join(this.baseDir, filename));
      const ext = filename.split('.').at(-1) ?? '';
      const mediaType = MEDIA_TYPE_BY_EXT[ext];
      if (!mediaType) return null;
      return {buffer, mediaType};
    } catch {
      return null;
    }
  }
}
