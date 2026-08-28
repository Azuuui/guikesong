import type {GenerateResponse} from '../../../shared/types';
import type {HistoryRecord} from '../features/history/historyTypes';

export function createDeferred<T>(){
  let resolve!:(value:T)=>void;
  let reject!:(reason?:unknown)=>void;
  const promise=new Promise<T>((resolvePromise,rejectPromise)=>{
    resolve=resolvePromise;
    reject=rejectPromise;
  });
  return {promise,resolve,reject};
}

export function makeGenerateResponse(options:{failedIndexes?:number[];pageCount?:number}={}):GenerateResponse{
  const failed=new Set(options.failedIndexes??[]);
  const pageCount=options.pageCount??3;
  return {
    requestId:'request-fixture',
    templateId:'ip-image',
    status:failed.size?'partial':'succeeded',
    copy:{
      title:'贵州夏季避暑宣传',
      body:'面向年轻游客的夏季避暑内容。',
      tags:['贵州旅行','夏季避暑'],
    },
    pages:Array.from({length:pageCount},(_,index)=>({
      id:`page-${index+1}`,
      pageType:index===0?'cover':index===pageCount-1?'ending':'content',
      filename:`ip-image-${index+1}.svg`,
      status:failed.has(index)?'failed':'succeeded',
      imageUrl:failed.has(index)?undefined:`data:image/svg+xml,fixture-${index+1}`,
      error:failed.has(index)?'图片生成服务暂时不可用':undefined,
      alt:`贵州夏季避暑宣传第 ${index+1} 页`,
    })),
    warnings:failed.size?['部分图片生成失败']:[],
  };
}

export function makeHistoryRecord(index=0,response=makeGenerateResponse()):HistoryRecord{
  const id=`request-${index}`;
  return {
    id,
    createdAt:new Date(Date.UTC(2026,7,29,5,index)).toISOString(),
    templateId:response.templateId,
    userPrompt:'贵州夏季避暑宣传',
    referenceFiles:[],
    response:{...response,requestId:id},
    pageBlobs:[],
  };
}
