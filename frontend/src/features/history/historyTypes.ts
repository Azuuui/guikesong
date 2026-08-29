import type {
  OriginalIpResult,
  ReferenceAsset,
  TravelGuideResult,
  UgcPhotoCampaignResult,
  XhsAtlasResult,
} from '../../../../shared/types';

export type StoredReferenceFile={
  asset:ReferenceAsset;
  blob:Blob;
};

export type StoredPageBlob={
  pageId:string;
  filename:string;
  mediaType:string;
  blob:Blob;
};

/** 原创 IP 历史：产品图 Blob + 产品描述；IP 档案 ID 与版本快照在 result 内。 */
export type OriginalIpHistoryRecord={
  id:string;
  createdAt:string;
  workflowId:'original-ip';
  userPrompt:string;
  productFile:StoredReferenceFile;
  result:OriginalIpResult;
  pageBlobs:StoredPageBlob[];
};

/** 图鉴历史：选题 + 0～4 张参考图 Blob；清单与候选标题在 result 内。 */
export type XhsAtlasHistoryRecord={
  id:string;
  createdAt:string;
  workflowId:'xhs-atlas';
  userPrompt:string;
  referenceFiles:StoredReferenceFile[];
  result:XhsAtlasResult;
  pageBlobs:StoredPageBlob[];
};

/** 手绘攻略历史：目的地一句话输入，无参考图；完整行程在 result 内。 */
export type TravelGuideHistoryRecord={
  id:string;
  createdAt:string;
  workflowId:'travel-guide';
  userPrompt:string;
  result:TravelGuideResult;
  pageBlobs:StoredPageBlob[];
};

/** 游客返图历史：活动主题 + 1～7 张投稿照片 Blob；情绪文案在 result 内。 */
export type UgcPhotoCampaignHistoryRecord={
  id:string;
  createdAt:string;
  workflowId:'ugc-photo-campaign';
  userPrompt:string;
  photoFiles:StoredReferenceFile[];
  result:UgcPhotoCampaignResult;
  pageBlobs:StoredPageBlob[];
};

export type HistoryRecord=
  |OriginalIpHistoryRecord
  |XhsAtlasHistoryRecord
  |TravelGuideHistoryRecord
  |UgcPhotoCampaignHistoryRecord;

export class HistorySaveError extends Error{
  override readonly name='HistorySaveError';

  constructor(message:string,options?:ErrorOptions){
    super(message,options);
  }
}

/** 从历史跳回创建页时随路由 state 传递的恢复文件。 */
export type RestoredFile={
  name:string;
  mediaType:string;
  blob:Blob;
};

export type RegenerationState={
  initialPrompt:string;
  restoredFiles:RestoredFile[];
};

/** 按工作流组装重新生成所需的一句话输入与本地文件。 */
export function buildRegenerationState(record:HistoryRecord):RegenerationState{
  if(record.workflowId==='original-ip'){
    return {
      initialPrompt:record.userPrompt,
      restoredFiles:[{
        name:record.productFile.asset.originalName,
        mediaType:record.productFile.asset.mediaType,
        blob:record.productFile.blob,
      }],
    };
  }
  if(record.workflowId==='travel-guide'){
    return {initialPrompt:record.userPrompt,restoredFiles:[]};
  }
  const files=record.workflowId==='ugc-photo-campaign'
    ?record.photoFiles
    :record.referenceFiles;
  return {
    initialPrompt:record.userPrompt,
    restoredFiles:files.map(file=>({
      name:file.asset.originalName,
      mediaType:file.asset.mediaType,
      blob:file.blob,
    })),
  };
}
