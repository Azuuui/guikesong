/**
 * 四工作流共享契约。
 * 所有新代码从本文件导入工作流类型；旧 shared/types.ts 仅在 Task 7 切换前保留。
 */

export const WORKFLOW_IDS = ['original-ip', 'xhs-atlas', 'travel-guide', 'ugc-photo-campaign'] as const;
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

export interface TravelGuideRequest {
  workflowId: 'travel-guide';
  /** 目的地短语：城市、景点或城市+景点。 */
  destination: string;
}

export interface UgcPhotoCampaignRequest {
  workflowId: 'ugc-photo-campaign';
  /** 投稿照片资产 ID，1～7 张，顺序即发布顺序。 */
  photoAssetIds: string[];
  /** 活动／征集主题，选填。 */
  campaignTheme?: string;
  /** 与 photoAssetIds 对齐的投稿昵称；空字符串表示该张未填写。 */
  photoCredits?: string[];
}

export type GenerateRequest =
  | OriginalIpRequest
  | XhsAtlasRequest
  | TravelGuideRequest
  | UgcPhotoCampaignRequest;

/* ---------- 页面 ---------- */

export type OriginalIpPageRole =
  | 'brand-cover'
  | 'identity-system'
  | 'product-system'
  | 'scene-application'
  | 'overview';

export type XhsAtlasPageRole = 'cover' | 'content';

export type TravelGuidePageRole = 'cover' | 'route' | 'transport' | 'stay' | 'food';

export type UgcPhotoCampaignPageRole = 'poster';

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

export interface TravelGuidePage extends WorkflowPageBase {
  role: TravelGuidePageRole;
  /** 路线页对应第几天（1 起）；其余页型缺省。 */
  day?: number;
}

export interface UgcPhotoCampaignPage extends WorkflowPageBase {
  role: 'poster';
  /** 对应第几张投稿照片（1 起）。 */
  photoIndex: number;
  /** 投稿用户昵称；未填写时缺省。 */
  credit?: string;
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

/* ---------- 手绘攻略行程契约 ---------- */

export interface TravelGuideCopy {
  /** 3 个候选标题。 */
  titles: string[];
  body: string;
  tags: string[];
}

export interface TravelGuideTopSpot {
  name: string;
  oneLiner: string;
}

export interface TravelGuideRouteStop {
  order: number;
  spot: string;
  desc: string;
  illustration: string;
  feature: string;
  hours: string;
  ticket: string;
  recommend: string;
}

export interface TravelGuideRouteLink {
  from: number;
  to: number;
  mode: string;
  duration: string;
}

export interface TravelGuideDayPlan {
  day: number;
  theme: string;
  slogan: string;
  route: TravelGuideRouteStop[];
  links: TravelGuideRouteLink[];
  tips: string[];
}

export interface TravelGuideTrip {
  destination: string;
  days: number;
  vibe: string;
  tocNote: string;
  cover: {
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    topSpots: TravelGuideTopSpot[];
  };
  dayPlans: TravelGuideDayPlan[];
  transport: {
    arrival: {way: string; detail: string}[];
    local: {way: string; detail: string}[];
    pitfall: string;
    slogan: string;
  };
  stay: {
    areas: {area: string; fit: string; why: string}[];
    tiers: {tier: string; range: string}[];
    /** 一句选择逻辑（什么人住哪个片区），写入页面底部方框。 */
    logic: string;
    slogan: string;
  };
  food: {
    items: {name: string; eat: string; where: string}[];
    slogan: string;
  };
}

export interface TravelGuideResult extends ResultBase<TravelGuidePage> {
  workflowId: 'travel-guide';
  copy: TravelGuideCopy;
  /** 规范化后的目的地。 */
  destination: string;
  /** 钳制后的游玩天数（1～3）。 */
  days: number;
  /** 已校验的完整行程 JSON。 */
  trip: TravelGuideTrip;
}

/* ---------- 游客返图互动契约 ---------- */

export interface UgcPhotoCampaignCopy {
  /** 3 个候选标题。 */
  titles: string[];
  body: string;
  tags: string[];
}

export interface UgcPhotoCampaignResult extends ResultBase<UgcPhotoCampaignPage> {
  workflowId: 'ugc-photo-campaign';
  copy: UgcPhotoCampaignCopy;
  /** 从整组照片提炼的共同情绪。 */
  mood: string;
  /** 活动／征集主题（有填写时回显）。 */
  campaignTheme?: string;
}

export type GenerateResult =
  | OriginalIpResult
  | XhsAtlasResult
  | TravelGuideResult
  | UgcPhotoCampaignResult;

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
