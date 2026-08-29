import path from 'node:path';
import express, {type Express, type NextFunction, type Request, type Response} from 'express';
import cors from 'cors';
import type {MockFixtures} from './providers/contracts';
import {createProviders} from './providers/providerFactory';
import {registerGeneratedAssetRoutes} from './routes/generatedAssets';
import {registerGenerateRoute} from './routes/generate';
import {registerIpProfileRoutes} from './routes/ipProfiles';
import {registerReferenceAssetRoutes} from './routes/referenceAssets';
import {AssetStore} from './storage/assetStore';
import {IpProfileStore} from './storage/ipProfileStore';
import {ReferenceAssetStore} from './storage/referenceAssetStore';
import {loadPublicConfig} from './config/env';
import {ApiError, toErrorResponse} from './http/apiError';
import {ORIGINAL_IP_MOCK_FIXTURES} from './workflows/original-ip/mockFixtures';
import {XHS_ATLAS_MOCK_FIXTURES} from './workflows/xhs-atlas/mockFixtures';
import {createDefaultWorkflowRegistry, type WorkflowRegistry} from './workflows/registry';

export interface AppDependencies {
  /** 健康检查使用的 Provider 模式，默认取公开配置。 */
  readonly providerMode?: 'mock' | 'real';
  /** 数据目录；测试注入临时目录。 */
  readonly dataDir?: string;
  /** 测试注入自定义工作流注册表。 */
  readonly registry?: WorkflowRegistry;
}

const MOCK_FIXTURES: MockFixtures = {
  text: {
    ...ORIGINAL_IP_MOCK_FIXTURES.text,
    ...XHS_ATLAS_MOCK_FIXTURES.text,
  },
  vision: {
    ...ORIGINAL_IP_MOCK_FIXTURES.vision,
    ...XHS_ATLAS_MOCK_FIXTURES.vision,
  },
};

function extractAssetIdFromUrl(url: string): string | null {
  const match = url.match(/^\/api\/reference-assets\/([A-Za-z0-9-]+)$/);
  return match ? match[1]! : null;
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({limit: '1mb'}));

  const providerMode = dependencies.providerMode ?? loadPublicConfig().providerMode;
  const dataDir = dependencies.dataDir ?? path.resolve('data');

  const referenceAssetStore = new ReferenceAssetStore(path.join(dataDir, 'reference-assets'));
  const ipProfileStore = new IpProfileStore(path.join(dataDir, 'ip-profiles'));
  const generatedAssetStore = new AssetStore(path.join(dataDir, 'generated-assets'));
  const providers = createProviders({
    providerMode,
    fixtures: providerMode === 'mock' ? MOCK_FIXTURES : undefined,
  });

  const registry = dependencies.registry
    ?? createDefaultWorkflowRegistry({
      originalIp: {
        providers,
        loadIpProfile: () => ipProfileStore.read(),
        loadIpReferenceImage: async () => {
          const profile = await ipProfileStore.read();
          if (!profile) {
            throw new ApiError(404, '尚未创建 IP 档案', 'IP_PROFILE_MISSING');
          }
          const assetId = extractAssetIdFromUrl(profile.referenceImageUrl);
          if (!assetId) {
            throw new ApiError(500, 'IP 档案数据异常，请重新初始化', 'IP_PROFILE_CORRUPT');
          }
          return referenceAssetStore.toDataUrl(assetId);
        },
        loadProductImage: assetId => referenceAssetStore.toDataUrl(assetId),
        saveGeneratedImage: image => generatedAssetStore.saveImage(image.bytes, image.mediaType),
      },
      xhsAtlas: {
        providers,
        loadReferenceImage: assetId => referenceAssetStore.toDataUrl(assetId),
        saveGeneratedImage: image => generatedAssetStore.saveImage(image.bytes, image.mediaType),
      },
    });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true, mode: providerMode});
  });

  registerReferenceAssetRoutes(app, {store: referenceAssetStore});
  registerIpProfileRoutes(app, {store: ipProfileStore, referenceAssets: referenceAssetStore});
  registerGenerateRoute(app, {registry});
  registerGeneratedAssetRoutes(app, {store: generatedAssetStore});

  app.use((_req: Request, res: Response) => {
    res.status(404).json({error: '接口不存在', code: 'NOT_FOUND'});
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const {status, body} = toErrorResponse(error);
    if (!(error instanceof ApiError)) {
      console.error('[api] unhandled error', {
        code: body.code,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
    res.status(status).json(body);
  });

  return app;
}
