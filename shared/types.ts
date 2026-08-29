/**
 * 公共共享契约。
 * 旧四模板（ip-image/travel-cards/scenery-collage/people-collage）合同已删除，
 * 生成请求与结果统一使用 shared/workflows.ts 的 workflowId 判别联合。
 */

export type ReferenceAsset = {
  assetId: string;
  url: string;
  originalName: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
  createdAt: string;
};

export {WORKFLOW_IDS} from './workflows';
export type {
  GenerateRequest,
  GenerateResult,
  IpProfile,
  IpProfilePublicOutput,
  OriginalIpCopy,
  OriginalIpPage,
  OriginalIpPageRole,
  OriginalIpRequest,
  OriginalIpResult,
  WorkflowId,
  WorkflowPageBase,
  XhsAtlasCopy,
  XhsAtlasList,
  XhsAtlasListCover,
  XhsAtlasListItem,
  XhsAtlasListMeta,
  XhsAtlasPage,
  XhsAtlasPageRole,
  XhsAtlasRequest,
  XhsAtlasResult,
} from './workflows';
