import type {Express, NextFunction, Request, Response} from 'express';
import multer from 'multer';
import {ApiError} from '../http/apiError';
import {validateImageUpload} from '../storage/imageValidation';
import type {ReferenceAssetStore} from '../storage/referenceAssetStore';

const MAX_REFERENCE_FILES = 4;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: MAX_UPLOAD_BYTES, files: MAX_REFERENCE_FILES},
});

export interface ReferenceAssetRouteDependencies {
  readonly store: ReferenceAssetStore;
}

/** Multer 错误转安全业务错误；其余原样透传给统一错误处理。 */
function toBusinessError(error: unknown): unknown {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(400, '单张图片不能超过 10MB', 'IMAGE_TOO_LARGE');
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return new ApiError(400, '参考图最多 4 张', 'TOO_MANY_REFERENCE_FILES');
    }
  }
  return error;
}

/** 参考图上传与访问路由。 */
export function registerReferenceAssetRoutes(
  app: Express,
  deps: ReferenceAssetRouteDependencies,
): void {
  app.post(
    '/api/reference-assets',
    (req: Request, res: Response, next: NextFunction) => {
      upload.array('files', MAX_REFERENCE_FILES)(req, res, error => next(toBusinessError(error)));
    },
    async (req: Request, res: Response) => {
      const files = (req.files ?? []) as Express.Multer.File[];
      if (files.length === 0) {
        throw new ApiError(400, '请上传图片', 'NO_FILES');
      }

      const assets = [];
      for (const file of files) {
        const validated = validateImageUpload({
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: file.originalname,
          size: file.size,
        });
        assets.push(await deps.store.save(validated));
      }
      res.status(201).json({assets});
    },
  );

  app.get('/api/reference-assets/:assetId', async (req: Request, res: Response) => {
    const {assetId} = req.params;
    if (typeof assetId !== 'string') {
      throw new ApiError(404, '参考图不存在', 'REFERENCE_ASSET_NOT_FOUND');
    }
    const image = await deps.store.read(assetId);
    if (!image) {
      throw new ApiError(404, '参考图不存在', 'REFERENCE_ASSET_NOT_FOUND');
    }
    res.setHeader('Content-Type', image.mediaType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(image.buffer);
  });
}
