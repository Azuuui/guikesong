import type {GenerateResponse} from '../../../../shared/types';
import {
  HistorySaveError,
  type HistoryRecord,
  type StoredPageBlob,
  type StoredReferenceFile,
} from './historyTypes';

export {HistorySaveError} from './historyTypes';

type Fetcher=(input:RequestInfo | URL,init?:RequestInit)=>Promise<Response>;

export type CaptureHistoryRecordInput={
  response:GenerateResponse;
  userPrompt:string;
  referenceFiles:StoredReferenceFile[];
  createdAt?:string;
  now?:()=>Date;
  fetcher?:Fetcher;
};

export type MaterializedResult={
  response:GenerateResponse;
  revoke:()=>void;
};

type ObjectUrlApi={
  createObjectURL:(blob:Blob)=>string;
  revokeObjectURL:(url:string)=>void;
};

function cloneResponse(response:GenerateResponse):GenerateResponse{
  return {
    ...response,
    copy:{...response.copy,tags:[...response.copy.tags]},
    pages:response.pages.map(page=>({...page})),
    warnings:[...response.warnings],
  };
}

async function capturePageBlob(
  page:GenerateResponse['pages'][number],
  fetcher:Fetcher,
):Promise<StoredPageBlob | undefined>{
  if(page.status!=='succeeded'||!page.imageUrl){
    return undefined;
  }

  const response=await fetcher(page.imageUrl);
  if(!response.ok){
    throw new Error(`图片读取失败（HTTP ${response.status}）`);
  }
  const blob=await response.blob();
  return {
    pageId:page.id,
    filename:page.filename,
    mediaType:blob.type||'application/octet-stream',
    blob,
  };
}

export async function captureHistoryRecord({
  response,
  userPrompt,
  referenceFiles,
  createdAt,
  now=()=>new Date(),
  fetcher=fetch,
}:CaptureHistoryRecordInput):Promise<HistoryRecord>{
  const savedAt=createdAt??now().toISOString();
  const responseSnapshot=cloneResponse(response);
  const referenceFilesSnapshot=referenceFiles.map(file=>({
    asset:{...file.asset},
    blob:file.blob,
  }));

  try{
    const captured=await Promise.all(
      responseSnapshot.pages.map(page=>capturePageBlob(page,fetcher)),
    );
    return {
      id:responseSnapshot.requestId,
      createdAt:savedAt,
      templateId:responseSnapshot.templateId,
      userPrompt,
      referenceFiles:referenceFilesSnapshot,
      response:responseSnapshot,
      pageBlobs:captured.filter((page):page is StoredPageBlob=>page!==undefined),
    };
  }catch(error){
    throw new HistorySaveError('生成结果可用，但图片无法保存到本机历史。',{cause:error});
  }
}

export function materializeHistoryResult(
  record:HistoryRecord,
  objectUrlApi:ObjectUrlApi=URL,
):MaterializedResult{
  const blobsByPageId=new Map(record.pageBlobs.map(page=>[page.pageId,page]));
  const objectUrls:string[]=[];

  try{
    const response=cloneResponse(record.response);
    response.pages=response.pages.map(page=>{
      if(page.status!=='succeeded'){
        return page;
      }
      const stored=blobsByPageId.get(page.id);
      if(!stored){
        return page;
      }
      const imageUrl=objectUrlApi.createObjectURL(stored.blob);
      objectUrls.push(imageUrl);
      return {...page,imageUrl};
    });

    let revoked=false;
    return {
      response,
      revoke(){
        if(revoked){
          return;
        }
        revoked=true;
        objectUrls.forEach(url=>objectUrlApi.revokeObjectURL(url));
      },
    };
  }catch(error){
    objectUrls.forEach(url=>objectUrlApi.revokeObjectURL(url));
    throw error;
  }
}
