import type {GenerateResult,WorkflowPageBase} from '../../../../shared/types';
import {
  HistorySaveError,
  type HistoryRecord,
  type StoredPageBlob,
  type StoredReferenceFile,
} from './historyTypes';

export {HistorySaveError} from './historyTypes';

type Fetcher=(input:RequestInfo | URL,init?:RequestInit)=>Promise<Response>;

const CAPTURE_TIMEOUT_MS=30_000;
const MAX_PAGE_BLOB_BYTES=25*1024*1024;
const MAX_TOTAL_PAGE_BLOB_BYTES=200*1024*1024;

export type CaptureHistoryRecordInput={
  result:GenerateResult;
  userPrompt:string;
  referenceFiles:StoredReferenceFile[];
  createdAt?:string;
  now?:()=>Date;
  fetcher?:Fetcher;
  signal?:AbortSignal;
};

export type MaterializedResult={
  result:GenerateResult;
  revoke:()=>void;
};

type ObjectUrlApi={
  createObjectURL:(blob:Blob)=>string;
  revokeObjectURL:(url:string)=>void;
};

/** 按工作流分支深拷贝，保证历史快照与页面状态互不影响。 */
function cloneResult(result:GenerateResult):GenerateResult{
  if(result.workflowId==='original-ip'){
    return {
      ...result,
      copy:{...result.copy,tags:[...result.copy.tags]},
      overview:result.overview?{...result.overview}:undefined,
      pages:result.pages.map(page=>({...page})),
      warnings:[...result.warnings],
    };
  }
  if(result.workflowId==='xhs-atlas'){
    return {
      ...result,
      copy:{...result.copy,titles:[...result.copy.titles],tags:[...result.copy.tags]},
      list:{
        meta:{
          ...result.list.meta,
          fieldLabels:[...result.list.meta.fieldLabels],
          pageSlogans:[...result.list.meta.pageSlogans],
        },
        cover:{...result.list.cover},
        items:result.list.items.map(item=>({...item})),
      },
      pages:result.pages.map(page=>({...page})),
      warnings:[...result.warnings],
    };
  }
  // travel-guide / ugc-photo-campaign：Phase I 接入历史前的保守深拷贝。
  const cloned={
    ...result,
    copy:{...result.copy,titles:[...result.copy.titles],tags:[...result.copy.tags]},
    pages:result.pages.map(page=>({...page})),
    warnings:[...result.warnings],
  };
  return cloned as typeof result;
}

async function capturePageBlob(
  page:WorkflowPageBase,
  fetcher:Fetcher,
  externalSignal:AbortSignal | undefined,
  captureSignal:AbortSignal,
  consumeBytes:(bytes:number)=>void,
):Promise<StoredPageBlob | undefined>{
  if(page.status!=='succeeded'||!page.imageUrl){
    return undefined;
  }

  const requestController=new AbortController();
  const abortRequest=(signal:AbortSignal)=>requestController.abort(signal.reason);
  const externalAbort=()=>externalSignal&&abortRequest(externalSignal);
  const captureAbort=()=>abortRequest(captureSignal);
  const timeout=setTimeout(
    ()=>requestController.abort(new DOMException('图片读取超时','TimeoutError')),
    CAPTURE_TIMEOUT_MS,
  );

  if(externalSignal?.aborted){
    externalAbort();
  }else{
    externalSignal?.addEventListener('abort',externalAbort,{once:true});
  }
  if(captureSignal.aborted){
    captureAbort();
  }else{
    captureSignal.addEventListener('abort',captureAbort,{once:true});
  }

  try{
    const response=await fetcher(page.imageUrl,{signal:requestController.signal});
    if(!response.ok){
      throw new Error(`图片读取失败（HTTP ${response.status}）`);
    }

    const declaredLength=Number(response.headers.get('content-length'));
    if(Number.isFinite(declaredLength)&&declaredLength>MAX_PAGE_BLOB_BYTES){
      throw new Error('单张历史图片超过 25MB 限制');
    }

    const declaredType=(response.headers.get('content-type')??'').split(';',1)[0].trim().toLowerCase();
    if(declaredType&&!declaredType.startsWith('image/')){
      throw new Error('历史图片响应类型无效');
    }

    let blob:Blob;
    if(response.body){
      const reader=response.body.getReader();
      const chunks:Uint8Array<ArrayBuffer>[]=[];
      let pageBytes=0;
      try{
        while(true){
          const {done,value}=await reader.read();
          if(done) break;
          pageBytes+=value.byteLength;
          if(pageBytes>MAX_PAGE_BLOB_BYTES){
            throw new Error('单张历史图片超过 25MB 限制');
          }
          consumeBytes(value.byteLength);
          chunks.push(new Uint8Array(value));
        }
      }catch(error){
        await reader.cancel(error).catch(()=>undefined);
        throw error;
      }
      if(!declaredType){
        throw new Error('历史图片响应缺少图片类型');
      }
      blob=new Blob(chunks,{type:declaredType});
    }else{
      blob=await response.blob();
      if(blob.size>MAX_PAGE_BLOB_BYTES){
        throw new Error('单张历史图片超过 25MB 限制');
      }
      consumeBytes(blob.size);
      const fallbackType=(blob.type||declaredType).toLowerCase();
      if(!fallbackType.startsWith('image/')){
        throw new Error('历史图片响应类型无效');
      }
      if(blob.type!==fallbackType){
        blob=blob.slice(0,blob.size,fallbackType);
      }
    }

    return {
      pageId:page.id,
      filename:page.filename,
      mediaType:blob.type,
      blob,
    };
  }finally{
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort',externalAbort);
    captureSignal.removeEventListener('abort',captureAbort);
  }
}

export async function captureHistoryRecord({
  result,
  userPrompt,
  referenceFiles,
  createdAt,
  now=()=>new Date(),
  fetcher=fetch,
  signal,
}:CaptureHistoryRecordInput):Promise<HistoryRecord>{
  const savedAt=createdAt??now().toISOString();
  const resultSnapshot=cloneResult(result);
  const referenceFilesSnapshot=referenceFiles.map(file=>({
    asset:{...file.asset},
    blob:file.blob,
  }));
  // 原创 IP 历史必须携带产品图快照，供重新生成时本地恢复。
  if(resultSnapshot.workflowId==='original-ip'&&!referenceFilesSnapshot[0]){
    throw new HistorySaveError('原创 IP 结果缺少产品图，无法保存本机历史。');
  }
  // travel-guide / ugc-photo-campaign 的历史结构在 Phase I 接入。
  if(resultSnapshot.workflowId!=='original-ip'&&resultSnapshot.workflowId!=='xhs-atlas'){
    throw new HistorySaveError('该工作流暂不支持保存到本机历史。');
  }
  const captureController=new AbortController();
  let totalBytes=0;
  const consumeBytes=(bytes:number)=>{
    totalBytes+=bytes;
    if(totalBytes>MAX_TOTAL_PAGE_BLOB_BYTES){
      throw new Error('历史图片总量超过 200MB 限制');
    }
  };

  try{
    const captured=await Promise.all(
      resultSnapshot.pages.map(page=>capturePageBlob(
        page,
        fetcher,
        signal,
        captureController.signal,
        consumeBytes,
      )),
    );
    const pageBlobs=captured.filter((page):page is StoredPageBlob=>page!==undefined);
    if(resultSnapshot.workflowId==='original-ip'){
      return {
        id:resultSnapshot.requestId,
        createdAt:savedAt,
        userPrompt,
        workflowId:'original-ip',
        productFile:referenceFilesSnapshot[0]!,
        result:resultSnapshot,
        pageBlobs,
      };
    }
    return {
      id:resultSnapshot.requestId,
      createdAt:savedAt,
      userPrompt,
      workflowId:'xhs-atlas',
      referenceFiles:referenceFilesSnapshot,
      result:resultSnapshot,
      pageBlobs,
    };
  }catch(error){
    captureController.abort(error);
    throw new HistorySaveError('生成结果可用，但图片无法保存到本机历史。',{cause:error});
  }
}

function withBlobUrl<TPage extends WorkflowPageBase>(
  page:TPage,
  blobsByPageId:Map<string,StoredPageBlob>,
  objectUrlApi:ObjectUrlApi,
  objectUrls:string[],
):TPage{
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
}

export function materializeHistoryResult(
  record:HistoryRecord,
  objectUrlApi:ObjectUrlApi=URL,
):MaterializedResult{
  const blobsByPageId=new Map(record.pageBlobs.map(page=>[page.pageId,page]));
  const objectUrls:string[]=[];

  try{
    const result=cloneResult(record.result);
    result.pages=result.pages.map(page=>
      withBlobUrl(page,blobsByPageId,objectUrlApi,objectUrls),
    ) as typeof result.pages;

    let revoked=false;
    return {
      result,
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
