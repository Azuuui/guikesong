import type {GenerateRequest, GenerateResult} from '../../../shared/workflows';
import type {GenerationJobProgress} from '../../../shared/generationJobs';

/** Workflow 执行上下文：由路由层构造并注入。 */
export interface WorkflowContext {
  readonly requestId: string;
  /**
   * 可选进度上报：后台任务 Runner 注入；同步接口不传。
   * 只允许上报公共阶段与图片计数，禁止携带提示词或 Provider 细节。
   */
  readonly reportProgress?: (progress: GenerationJobProgress) => Promise<void>;
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

/** 上报进度的统一入口：未注入回调时为无操作，保持同步接口行为不变。 */
export async function reportWorkflowProgress(
  context: WorkflowContext,
  progress: GenerationJobProgress,
): Promise<void> {
  await context.reportProgress?.(progress);
}
