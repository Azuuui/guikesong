import type {Express, Request, Response} from 'express';
import {ApiError} from '../http/apiError';
import type {AssetStore} from '../storage/assetStore';

export interface GeneratedAssetRouteDependencies {
  readonly store: AssetStore;
}

/** 生成结果图的读取路由；文件名严格匹配高熵 ID + 白名单扩展名。 */
export function registerGeneratedAssetRoutes(
  app: Express,
  deps: GeneratedAssetRouteDependencies,
): void {
  app.get('/api/generated-assets/:filename', async (req: Request, res: Response) => {
    const {filename} = req.params;
    if (typeof filename !== 'string') {
      throw new ApiError(404, '生成图不存在', 'GENERATED_ASSET_NOT_FOUND');
    }
    const image = await deps.store.readImage(filename);
    if (!image) {
      throw new ApiError(404, '生成图不存在', 'GENERATED_ASSET_NOT_FOUND');
    }
    res.setHeader('Content-Type', image.mediaType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(image.buffer);
  });
}
