import type {GenerateResult, ReferenceAsset, WorkflowId} from '../../../../shared/types';

export type CreatePhase = 'idle' | 'validating' | 'uploading' | 'generating' | 'saving' | 'error';

export interface StoredReferenceFileInput {
  asset: ReferenceAsset;
  blob: Blob;
}

/** 历史保存入参：原创 IP 传产品图，图鉴传参考图。 */
export interface WorkflowSaveInput {
  workflowId: WorkflowId;
  result: GenerateResult;
  /** 用户一句话输入：原创 IP 为产品描述，图鉴为选题。 */
  userPrompt: string;
  referenceFiles: StoredReferenceFileInput[];
  createdAt: string;
  signal?: AbortSignal;
}

/** 表单完成回调：由 CreatePage 统一跳转结果页。 */
export interface WorkflowCompletion {
  requestId: string;
  createdAt: string;
  historySaveWarning?: string;
  result: GenerateResult;
  userPrompt: string;
}

export interface WorkflowFormProps {
  onComplete: (completion: WorkflowCompletion) => void;
  onPhaseChange?: (phase: CreatePhase) => void;
  saveResult: (input: WorkflowSaveInput) => Promise<void>;
}

export const HISTORY_SAVE_WARNING = '素材已经生成，但未能保存到本机历史。请先下载素材包。';

export function isActivePhase(phase: CreatePhase): boolean {
  return phase === 'validating' || phase === 'uploading' || phase === 'generating' || phase === 'saving';
}
