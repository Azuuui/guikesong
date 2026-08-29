import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {ReferenceAsset} from '../../../shared/types';
import {ApiError} from '../http/apiError';
import type {StoredImageMediaType} from './assetStore';

const EXT_BY_MEDIA_TYPE: Record<StoredImageMediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const MEDIA_TYPES = Object.keys(EXT_BY_MEDIA_TYPE) as StoredImageMediaType[];

/** 高熵资产 ID（UUID 十六进制）之外一律拒绝，防止路径拼接攻击。 */
const ASSET_ID_PATTERN = /^[a-f0-9-]{10,64}$/i;

export interface ReferenceAssetInput {
  buffer: Buffer;
  mediaType: StoredImageMediaType;
  originalName: string;
  size: number;
}

/**
 * 普通参考图存储（data/reference-assets/）。
 * 落盘文件名为 `{assetId}.{ext}`；读取只按固定扩展名定位，不做目录扫描。
 */
export class ReferenceAssetStore {
  constructor(private readonly baseDir: string) {}

  async save(input: ReferenceAssetInput): Promise<ReferenceAsset> {
    await fs.mkdir(this.baseDir, {recursive: true});
    const assetId = randomUUID();
    const filename = `${assetId}.${EXT_BY_MEDIA_TYPE[input.mediaType]}`;
    await fs.writeFile(path.join(this.baseDir, filename), input.buffer);
    return {
      assetId,
      url: `/api/reference-assets/${assetId}`,
      originalName: input.originalName,
      mediaType: input.mediaType,
      size: input.size,
      createdAt: new Date().toISOString(),
    };
  }

  /** 按资产 ID 读取图片；不存在时返回 null。 */
  async read(assetId: string): Promise<{buffer: Buffer; mediaType: StoredImageMediaType} | null> {
    if (!ASSET_ID_PATTERN.test(assetId)) return null;
    for (const mediaType of MEDIA_TYPES) {
      try {
        const buffer = await fs.readFile(
          path.join(this.baseDir, `${assetId}.${EXT_BY_MEDIA_TYPE[mediaType]}`),
        );
        return {buffer, mediaType};
      } catch {
        // 尝试下一个扩展名
      }
    }
    return null;
  }

  /** 工作流内部使用：把参考图读成 data URL 供生图调用。 */
  async toDataUrl(assetId: string): Promise<string> {
    const image = await this.read(assetId);
    if (!image) {
      throw new ApiError(404, '参考图不存在或已过期，请重新上传', 'REFERENCE_ASSET_NOT_FOUND');
    }
    return `data:${image.mediaType};base64,${image.buffer.toString('base64')}`;
  }
}
