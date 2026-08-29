import type {Express, NextFunction, Request, Response} from 'express';
import multer from 'multer';
import type {IpProfile, IpProfilePublicOutput} from '../../../shared/workflows';
import {ApiError} from '../http/apiError';
import type {IpProfileStore} from '../storage/ipProfileStore';
import {validateImageUpload} from '../storage/imageValidation';
import type {ReferenceAssetStore} from '../storage/referenceAssetStore';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: MAX_UPLOAD_BYTES, files: 1},
});

export interface IpProfileRouteDependencies {
  readonly store: IpProfileStore;
  readonly referenceAssets: ReferenceAssetStore;
}

function toPublicOutput(profile: IpProfile): IpProfilePublicOutput {
  return {
    ipProfileId: profile.ipProfileId,
    version: profile.version,
    name: profile.name,
    referenceImageUrl: profile.referenceImageUrl,
    description: profile.description,
    status: profile.status,
  };
}

function readTextField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  return typeof value === 'string' ? value.trim() : '';
}

/** IP 档案创建、读取与锁定路由。 */
export function registerIpProfileRoutes(app: Express, deps: IpProfileRouteDependencies): void {
  app.post(
    '/api/ip-profiles',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, error => {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(400, '单张图片不能超过 10MB', 'IMAGE_TOO_LARGE'));
        }
        return next(error);
      });
    },
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const file = req.file;
      if (!file) {
        throw new ApiError(400, '请上传 IP 标准图', 'IP_IMAGE_REQUIRED');
      }

      const name = readTextField(body, 'name');
      if (name.length === 0) throw new ApiError(400, '请输入 IP 名称', 'IP_NAME_REQUIRED');
      if (name.length > 50) throw new ApiError(400, 'IP 名称不超过 50 字', 'IP_NAME_TOO_LONG');

      const description = readTextField(body, 'description');
      if (description.length === 0) throw new ApiError(400, '请输入 IP 描述', 'IP_DESCRIPTION_REQUIRED');
      if (description.length > 500) {
        throw new ApiError(400, 'IP 描述不超过 500 字', 'IP_DESCRIPTION_TOO_LONG');
      }

      const validated = validateImageUpload({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      });
      const asset = await deps.referenceAssets.save(validated);
      const profile = await deps.store.save({
        name,
        description,
        referenceImageUrl: asset.url,
      });
      res.status(201).json(toPublicOutput(profile));
    },
  );

  app.get('/api/ip-profiles/active', async (_req: Request, res: Response) => {
    const profile = await deps.store.read();
    if (!profile) {
      throw new ApiError(404, '尚未创建 IP 档案', 'IP_PROFILE_MISSING');
    }
    res.json(toPublicOutput(profile));
  });

  app.post('/api/ip-profiles/:ipProfileId/lock', async (req: Request, res: Response) => {
    const profile = await deps.store.read();
    if (!profile) {
      throw new ApiError(404, '尚未创建 IP 档案', 'IP_PROFILE_MISSING');
    }
    if (profile.ipProfileId !== req.params.ipProfileId) {
      throw new ApiError(409, 'IP 档案已更新，请刷新后重试', 'IP_PROFILE_MISMATCH');
    }
    const locked = await deps.store.lock();
    res.json(toPublicOutput(locked));
  });
}
