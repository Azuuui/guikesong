import {z} from 'zod';
import {WORKFLOW_IDS, type GenerateRequest, type WorkflowId} from './workflows';

/** 请求级业务校验错误：消息面向用户，code 面向前端逻辑。 */
export class WorkflowValidationError extends Error {
  constructor(
    message: string,
    readonly code: string = 'INVALID_REQUEST',
  ) {
    super(message);
    this.name = 'WorkflowValidationError';
  }
}

/** strict：额外字段一律拒绝，防止敏感字段进入工作流。 */
const originalIpRequestSchema = z
  .object({
    workflowId: z.literal('original-ip'),
    ipProfileId: z.string().min(1, 'IP 档案或产品图缺失'),
    productAssetId: z.string().min(1, 'IP 档案或产品图缺失'),
    productDescription: z.string().trim().min(1, '请输入产品描述').max(500, '产品描述不超过 500 字'),
  })
  .strict();

const xhsAtlasRequestSchema = z
  .object({
    workflowId: z.literal('xhs-atlas'),
    topic: z.string().trim().min(1, '请输入选题'),
    referenceAssetIds: z.array(z.string().min(1)).max(4, '参考图最多 4 张'),
  })
  .strict();

function firstIssueMessage(error: z.ZodError, fallback: string): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  // 未知字段不回显字段名，避免把客户端内部结构泄露到提示里。
  if (issue.code === 'unrecognized_keys') return '请求包含未知字段，请刷新页面后重试';
  return typeof issue.message === 'string' && issue.message.length > 0 ? issue.message : fallback;
}

function assertTopicQuantity(topic: string): void {
  const match = topic.match(/\d+/);
  if (!match) {
    throw new WorkflowValidationError('选题需包含数量，如"贵阳的12种美食"', 'TOPIC_MISSING_QUANTITY');
  }
  if (Number(match[0]) < 2) {
    throw new WorkflowValidationError('选题数量至少为 2', 'TOPIC_BELOW_MIN');
  }
}

/**
 * 解析并校验生成请求。
 * 只做请求级结构校验和数量边界；图鉴数量钳制等业务规范化由工作流负责。
 */
export function parseGenerateRequest(value: unknown): GenerateRequest {
  if (typeof value !== 'object' || value === null) {
    throw new WorkflowValidationError('未知工作流', 'UNKNOWN_WORKFLOW');
  }
  const {workflowId} = value as {workflowId?: unknown};

  if (workflowId === 'original-ip') {
    const parsed = originalIpRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw new WorkflowValidationError(firstIssueMessage(parsed.error, '原创 IP 请求不合法'), 'INVALID_REQUEST');
    }
    return parsed.data;
  }

  if (workflowId === 'xhs-atlas') {
    const parsed = xhsAtlasRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw new WorkflowValidationError(firstIssueMessage(parsed.error, '图鉴请求不合法'), 'INVALID_REQUEST');
    }
    assertTopicQuantity(parsed.data.topic);
    return parsed.data;
  }

  throw new WorkflowValidationError('未知工作流', 'UNKNOWN_WORKFLOW');
}

export function isWorkflowId(value: unknown): value is WorkflowId {
  return typeof value === 'string' && (WORKFLOW_IDS as readonly string[]).includes(value);
}
