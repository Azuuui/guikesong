import type {
  OriginalIpResult,
  ReferenceAsset,
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

export type HistoryRecord=OriginalIpHistoryRecord|XhsAtlasHistoryRecord;

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
  return {
    initialPrompt:record.userPrompt,
    restoredFiles:record.referenceFiles.map(file=>({
      name:file.asset.originalName,
      mediaType:file.asset.mediaType,
      blob:file.blob,
    })),
  };
}
