import type {GenerateResponse,ReferenceAsset,TemplateId} from '../../../../shared/types';

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

export type HistoryRecord={
  id:string;
  createdAt:string;
  templateId:TemplateId;
  userPrompt:string;
  referenceFiles:StoredReferenceFile[];
  response:GenerateResponse;
  pageBlobs:StoredPageBlob[];
};

export class HistorySaveError extends Error{
  override readonly name='HistorySaveError';

  constructor(message:string,options?:ErrorOptions){
    super(message,options);
  }
}
