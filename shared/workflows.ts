/**
 * 双工作流共享契约。
 * 所有新代码从本文件导入工作流类型；旧 shared/types.ts 仅在 Task 7 切换前保留。
 */

export const WORKFLOW_IDS = ['original-ip', 'xhs-atlas'] as const;
export type WorkflowId = typeof WORKFLOW_IDS[number];

/* ---------- 请求 ---------- */

export interface OriginalIpRequest {
  workflowId: 'original-ip';
  ipProfileId: string;
  productAssetId: string;
  productDescription: string;
}

export interface XhsAtlasRequest {
  workflowId: 'xhs-atlas';
  topic: string;
  referenceAssetIds: string[];
}

export type GenerateRequest = OriginalIpRequest | XhsAtlasRequest;

/* ---------- 页面 ---------- */

export type OriginalIpPageRole =
  | 'brand-cover'
  | 'identity-system'
  | 'product-system'
  | 'scene-application'
  | 'overview';

export type XhsAtlasPageRole = 'cover' | 'content';

export interface WorkflowPageBase {
  id: string;
  filename: string;
  status: 'succeeded' | 'failed';
  /** 指向后端生成资产 URL 或 Mock data URL。 */
  imageUrl?: string;
  alt?: string;
  error?: string;
}

export interface OriginalIpPage extends WorkflowPageBase {
  role: OriginalIpPageRole;
}

export interface XhsAtlasPage extends WorkflowPageBase {
  role: XhsAtlasPageRole;
}

/* ---------- 结果 ---------- */

export interface ResultBase<TPage> {
  requestId: string;
  status: 'succeeded' | 'partial';
  pages: TPage[];
  warnings: string[];
}

export interface OriginalIpCopy {
  title: string;
  body: string;
  tags: string[];
}

export interface OriginalIpResult extends ResultBase<OriginalIpPage> {
  workflowId: 'original-ip';
  copy: OriginalIpCopy;
  ipProfileId: string;
  ipProfileVersion: number;
  /** 程序拼接的 2×2 总览图信息；拼接失败时缺省并伴随 warning。 */
  overview?: {pageId: string; filename: string};
}

export interface XhsAtlasCopy {
  /** 3 个候选标题。 */
  titles: string[];
  body: string;
  tags: string[];
}

export interface XhsAtlasListMeta {
  userTitle: string;
  count: number;
  measureWord: string;
  domainType: string;
  orgDimension: string;
  themeWord: string;
  fieldLabels: [string, string];
  motif: string;
  palette: string;
  /** 恰好 6 句递进金句。 */
  pageSlogans: string[];
}

export interface XhsAtlasListCover {
  titleLine1: string;
  titleLine2: string;
  highlightWord: string;
  stickyNote: string;
  bottomSlogan: string;
}

export interface XhsAtlasListItem {
  no: string;
  tag: string;
  name: string;
  line1: string;
  line2: string;
  punch: string;
  illustrationHint: string;
}

export interface XhsAtlasList {
  meta: XhsAtlasListMeta;
  cover: XhsAtlasListCover;
  items: XhsAtlasListItem[];
}

export interface XhsAtlasResult extends ResultBase<XhsAtlasPage> {
  workflowId: 'xhs-atlas';
  copy: XhsAtlasCopy;
  /** 规范化后的选题。 */
  topic: string;
  /** 已校验清单 JSON。 */
  list: XhsAtlasList;
}

export type GenerateResult = OriginalIpResult | XhsAtlasResult;

/* ---------- IP Profile ---------- */

export interface IpProfile {
  ipProfileId: string;
  version: number;
  name: string;
  referenceImageUrl: string;
  description: string;
  status: 'draft' | 'locked';
  createdAt: string;
  updatedAt: string;
}

export interface IpProfilePublicOutput {
  ipProfileId: string;
  version: number;
  name: string;
  referenceImageUrl: string;
  description: string;
  status: 'draft' | 'locked';
}
