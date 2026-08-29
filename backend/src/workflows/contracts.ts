import type {GenerateRequest, GenerateResult} from '../../../shared/workflows';

/** Workflow 执行上下文：由路由层构造并注入。 */
export interface WorkflowContext {
  readonly requestId: string;
}

/**
 * 工作流接口：一个模板对应一个 Workflow。
 * 未来新增模板时实现本接口并注册，禁止修改既有 Workflow 内部逻辑。
 */
export interface Workflow<
  TRequest extends GenerateRequest = GenerateRequest,
  TResult extends GenerateResult = GenerateResult,
> {
  readonly id: TRequest['workflowId'];
  run(input: TRequest, context: WorkflowContext): Promise<TResult>;
}
