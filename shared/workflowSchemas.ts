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

const travelGuideRequestSchema = z
  .object({
    workflowId: z.literal('travel-guide'),
    destination: z.string().trim().min(2, '请输入目的地，如"成都"或"杭州西湖"').max(30, '目的地不超过 30 字'),
  })
  .strict();

const ugcPhotoCampaignRequestSchema = z
  .object({
    workflowId: z.literal('ugc-photo-campaign'),
    photoAssetIds: z.array(z.string().min(1)).min(1, '请上传 1～7 张投稿照片').max(7, '投稿照片最多 7 张'),
    campaignTheme: z.string().trim().max(50, '活动主题不超过 50 字').optional(),
    photoCredits: z.array(z.string().trim().max(30, '投稿昵称不超过 30 字')).optional(),
  })
  .strict()
  .refine(
    value => !value.photoCredits || value.photoCredits.length === value.photoAssetIds.length,
    {message: '投稿昵称数量需与照片数量一致'},
  );

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

/** 范围过大的地点：国家、大区、星球级输入，无法落到 1～3 天的行程。 */
const BROAD_DESTINATIONS = new Set([
  '中国',
  '中华',
  '中华人民共和国',
  '大中华',
  '祖国',
  '国内',
  '全国',
  '全国各地',
  '世界',
  '全球',
  '地球',
  '亚洲',
  '欧洲',
  '非洲',
  '美洲',
  '北美洲',
  '南美洲',
  '北美',
  '南美',
  '大洋洲',
  '南极洲',
  '南极',
  '北极',
  '宇宙',
  '太空',
  '太阳系',
  '月球',
]);

/** 纯数字／符号组合显然不是地点。 */
const NON_PLACE_PATTERN = /^[\d\s\p{P}\p{S}]+$/u;

function assertDestination(destination: string): void {
  if (BROAD_DESTINATIONS.has(destination)) {
    throw new WorkflowValidationError(
      '目的地范围过大，请输入城市或景点，如"成都"或"杭州西湖"',
      'DESTINATION_TOO_BROAD',
    );
  }
  if (NON_PLACE_PATTERN.test(destination)) {
    throw new WorkflowValidationError(
      '请输入一个具体的目的地，如"成都"或"杭州西湖"',
      'DESTINATION_INVALID',
    );
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

  if (workflowId === 'travel-guide') {
    const parsed = travelGuideRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw new WorkflowValidationError(firstIssueMessage(parsed.error, '手绘攻略请求不合法'), 'INVALID_REQUEST');
    }
    assertDestination(parsed.data.destination);
    return parsed.data;
  }

  if (workflowId === 'ugc-photo-campaign') {
    const parsed = ugcPhotoCampaignRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw new WorkflowValidationError(firstIssueMessage(parsed.error, '游客返图请求不合法'), 'INVALID_REQUEST');
    }
    const {campaignTheme, photoCredits, ...rest} = parsed.data;
    return {
      ...rest,
      campaignTheme: campaignTheme === '' ? undefined : campaignTheme,
      photoCredits,
    };
  }

  throw new WorkflowValidationError('未知工作流', 'UNKNOWN_WORKFLOW');
}

export function isWorkflowId(value: unknown): value is WorkflowId {
  return typeof value === 'string' && (WORKFLOW_IDS as readonly string[]).includes(value);
}
