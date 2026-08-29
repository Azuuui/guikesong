/**
 * 后台生成任务公共合同。
 * 任务是短期运行状态（默认保留 24 小时），完整用户历史仍在浏览器 IndexedDB。
 * API 不得通过任务快照暴露提示词、密钥、上游正文或物理路径。
 */
import {WORKFLOW_IDS, type GenerateResult, type WorkflowId} from './workflows';

export type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';

export type GenerationJobPhase = 'preparing' | 'content' | 'copy' | 'images' | 'finalizing';

/** 工作流进度事件：只表达公共阶段与图片计数，不携带内部实现细节。 */
export type GenerationJobProgress = {
  phase: GenerationJobPhase;
  completedImages?: number;
  totalImages?: number;
};

/** 安全错误：code 面向前端逻辑，message 面向用户。 */
export type GenerationJobError = {
  code: string;
  message: string;
};

export type GenerationJobSnapshot = {
  jobId: string;
  workflowId: WorkflowId;
  status: GenerationJobStatus;
  phase: GenerationJobPhase;
  completedImages: number;
  totalImages: number;
  createdAt: string;
  updatedAt: string;
  result: GenerateResult | null;
  error: GenerationJobError | null;
};

export type CreateGenerationJobResponse = Pick<
  GenerationJobSnapshot,
  'jobId' | 'status' | 'createdAt'
>;

const JOB_STATUSES: readonly GenerationJobStatus[] = [
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
];

const JOB_PHASES: readonly GenerationJobPhase[] = [
  'preparing',
  'content',
  'copy',
  'images',
  'finalizing',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** ISO-8601 字符串：仅校验非空且可被 Date 解析，不约束精度与时区。 */
function isIsoString(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isGenerationJobError(value: unknown): value is GenerationJobError {
  return isRecord(value) && isNonEmptyString(value.code) && isNonEmptyString(value.message);
}

/**
 * 任务快照运行时守卫。
 * 结果对象只校验“存在且 workflowId 与任务一致”；pages 等完整结构由前端
 * 现有 isGenerateResult 守卫负责，避免在共享合同重复一套大型结果校验。
 */
export function isGenerationJobSnapshot(value: unknown): value is GenerationJobSnapshot {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.jobId)) return false;
  if (typeof value.workflowId !== 'string' || !WORKFLOW_IDS.includes(value.workflowId as WorkflowId)) {
    return false;
  }
  if (typeof value.status !== 'string' || !JOB_STATUSES.includes(value.status as GenerationJobStatus)) {
    return false;
  }
  if (typeof value.phase !== 'string' || !JOB_PHASES.includes(value.phase as GenerationJobPhase)) {
    return false;
  }
  if (!isNonNegativeInteger(value.completedImages) || !isNonNegativeInteger(value.totalImages)) {
    return false;
  }
  if (value.completedImages > value.totalImages) return false;
  if (!isIsoString(value.createdAt) || !isIsoString(value.updatedAt)) return false;

  const terminal = value.status === 'succeeded' || value.status === 'partial';
  if (terminal) {
    if (!isRecord(value.result)) return false;
    if (value.result.workflowId !== value.workflowId) return false;
    if (value.error !== null) return false;
    return true;
  }
  if (value.status === 'failed') {
    return isGenerationJobError(value.error) && value.result === null;
  }
  // queued / running：不得提前携带结果或错误。
  return value.result === null && value.error === null;
}
