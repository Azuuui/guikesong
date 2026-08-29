import express, {type Express, type NextFunction, type Request, type Response} from 'express';
import cors from 'cors';
import {loadPublicConfig} from './config/env';
import {ApiError, toErrorResponse} from './http/apiError';
import {registerLegacyRoutes} from './legacy/registerLegacyRoutes';

export interface AppDependencies {
  /** 健康检查使用的 Provider 模式，默认取公开配置。 */
  readonly providerMode?: 'mock' | 'real';
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({limit: '1mb'}));

  const providerMode = dependencies.providerMode ?? loadPublicConfig().providerMode;

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true, mode: providerMode});
  });

  registerLegacyRoutes(app);

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
