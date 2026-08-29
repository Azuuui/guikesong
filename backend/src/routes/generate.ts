import {randomUUID} from 'node:crypto';
import type {Express, Request, Response} from 'express';
import {parseGenerateRequest, WorkflowValidationError} from '../../../shared/workflowSchemas';
import {ApiError} from '../http/apiError';
import type {WorkflowRegistry} from '../workflows/registry';

export interface GenerateRouteDependencies {
  readonly registry: WorkflowRegistry;
}

/**
 * 统一生成入口：解析判别联合请求并委托 Workflow 注册表。
 * 请求级结构错误返回安全 4xx；工作流内部错误统一走错误中间件。
 */
export function registerGenerateRoute(app: Express, deps: GenerateRouteDependencies): void {
  app.post('/api/generate', async (req: Request, res: Response) => {
    let request;
    try {
      request = parseGenerateRequest(req.body);
    } catch (error) {
      if (error instanceof WorkflowValidationError) {
        throw new ApiError(400, error.message, error.code);
      }
      throw error;
    }

    const workflow = deps.registry.get(request.workflowId);
    const result = await workflow.run(request, {requestId: randomUUID()});
    res.json(result);
  });
}
