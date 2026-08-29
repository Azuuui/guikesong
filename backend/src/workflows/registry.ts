import type {WorkflowId} from '../../../shared/workflows';
import {WORKFLOW_IDS} from '../../../shared/workflows';
import {ApiError} from '../http/apiError';
import type {Workflow} from './contracts';

export interface WorkflowRegistry {
  get(workflowId: string): Workflow;
  list(): WorkflowId[];
}

/**
 * 创建工作流注册表。
 * 重复注册抛业务错误；未知 ID 抛不含内部路径的安全业务错误。
 */
export function createWorkflowRegistry(workflows: readonly Workflow[]): WorkflowRegistry {
  const byId = new Map<string, Workflow>();

  for (const workflow of workflows) {
    if (byId.has(workflow.id)) {
      throw new ApiError(500, `工作流 ${workflow.id} 重复注册`, 'WORKFLOW_DUPLICATE');
    }
    byId.set(workflow.id, workflow);
  }

  return {
    get(workflowId: string): Workflow {
      const workflow = byId.get(workflowId);
      if (!workflow) {
        throw new ApiError(404, '未知工作流', 'WORKFLOW_NOT_FOUND');
      }
      return workflow;
    },
    list(): WorkflowId[] {
      return [...byId.keys()].filter((id): id is WorkflowId =>
        (WORKFLOW_IDS as readonly string[]).includes(id),
      );
    },
  };
}
