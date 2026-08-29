import {ApiError} from '../http/apiError';
import type {StoredImageMediaType} from './assetStore';

/** 上传图片的大小上限（10MB）。 */
export const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;

export interface RawUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface ValidatedImage {
  buffer: Buffer;
  mediaType: StoredImageMediaType;
  originalName: string;
  size: number;
}

function hasPngSignature(buffer: Buffer): boolean {
  return (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  );
}

function hasJpegSignature(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function hasWebpSignature(buffer: Buffer): boolean {
  return (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('latin1') === 'RIFF'
    && buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

function sanitizeOriginalName(originalname: string): string {
  const normalized = originalname.replaceAll('\\', '/');
  const basename = normalized.split('/').at(-1) ?? '';
  const cleaned = basename.replace(/[^\w.-]/g, '_').replace(/^\.+/, '_');
  return cleaned.length > 0 ? cleaned.slice(-120) : 'upload';
}

/**
 * 校验上传图片：MIME 白名单、文件签名、大小上限。
 * 通过后返回归一化数据；失败抛出面向用户的安全业务错误。
 */
export function validateImageUpload(file: RawUploadFile): ValidatedImage {
  if (file.size > MAX_UPLOAD_IMAGE_BYTES || file.buffer.length > MAX_UPLOAD_IMAGE_BYTES) {
    throw new ApiError(400, '单张图片不能超过 10MB', 'IMAGE_TOO_LARGE');
  }

  let mediaType: StoredImageMediaType;
  switch (file.mimetype) {
    case 'image/png':
      if (!hasPngSignature(file.buffer)) throw new ApiError(400, '图片签名无效', 'IMAGE_SIGNATURE_INVALID');
      mediaType = 'image/png';
      break;
    case 'image/jpeg':
      if (!hasJpegSignature(file.buffer)) throw new ApiError(400, '图片签名无效', 'IMAGE_SIGNATURE_INVALID');
      mediaType = 'image/jpeg';
      break;
    case 'image/webp':
      if (!hasWebpSignature(file.buffer)) throw new ApiError(400, '图片签名无效', 'IMAGE_SIGNATURE_INVALID');
      mediaType = 'image/webp';
      break;
    default:
      throw new ApiError(400, '仅支持 JPG、PNG、WebP', 'IMAGE_TYPE_UNSUPPORTED');
  }

  if (file.buffer.length === 0) {
    throw new ApiError(400, '图片内容为空', 'IMAGE_EMPTY');
  }

  return {
    buffer: file.buffer,
    mediaType,
    originalName: sanitizeOriginalName(file.originalname),
    size: file.size,
  };
}
