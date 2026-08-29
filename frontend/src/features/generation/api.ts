import type {
  GenerateRequest,
  GenerateResponse,
  ReferenceAsset,
} from '../../../../shared/types';
import {TEMPLATE_IDS} from '../../../../shared/types';

const NETWORK_ERROR_MESSAGE='网络连接失败，请稍后重试';
const REQUEST_ABORTED_MESSAGE='请求已中止，请重新操作';
const REQUEST_TIMEOUT_MESSAGE='请求超时，请稍后重试';
const REQUEST_TIMEOUT_MS=30_000;
const SAFE_BUSINESS_ERRORS=new Set([
  '请上传图片',
  '仅支持 JPG、PNG、WebP',
  '图片签名无效',
  '未知模板',
  '请输入 2-500 字需求',
  '参考图最多 4 张',
]);
const REFERENCE_MEDIA_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const PAGE_TYPES=new Set(['cover','content','ending']);
const PAGE_STATUSES=new Set(['succeeded','failed']);
const RESPONSE_STATUSES=new Set(['succeeded','partial']);

export class ApiError extends Error{
  constructor(public status:number,message:string){
    super(message);
    this.name='ApiError';
  }
}

function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==='object'&&value!==null;
}

function isNonEmptyString(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0;
}

function isOptionalString(value:unknown):boolean{
  return value===undefined||typeof value==='string';
}

function isReferenceAsset(value:unknown):value is ReferenceAsset{
  if(!isRecord(value)) return false;
  return isNonEmptyString(value.assetId)
    &&isNonEmptyString(value.url)
    &&isNonEmptyString(value.originalName)
    &&typeof value.mediaType==='string'
    &&REFERENCE_MEDIA_TYPES.has(value.mediaType)
    &&typeof value.size==='number'
    &&Number.isFinite(value.size)
    &&value.size>=0
    &&isNonEmptyString(value.createdAt);
}

function isGenerateResponse(value:unknown):value is GenerateResponse{
  if(!isRecord(value)||!isRecord(value.copy)) return false;
  if(!isNonEmptyString(value.requestId)
    ||typeof value.templateId!=='string'
    ||!TEMPLATE_IDS.some(templateId=>templateId===value.templateId)
    ||typeof value.status!=='string'
    ||!RESPONSE_STATUSES.has(value.status)
    ||typeof value.copy.title!=='string'
    ||typeof value.copy.body!=='string'
    ||!Array.isArray(value.copy.tags)
    ||!value.copy.tags.every(tag=>typeof tag==='string')
    ||!Array.isArray(value.pages)
    ||!Array.isArray(value.warnings)
    ||!value.warnings.every(warning=>typeof warning==='string')) return false;

  return value.pages.every(page=>{
    if(!isRecord(page)) return false;
    if(!isNonEmptyString(page.id)
      ||typeof page.pageType!=='string'
      ||!PAGE_TYPES.has(page.pageType)
      ||!isNonEmptyString(page.filename)
      ||typeof page.status!=='string'
      ||!PAGE_STATUSES.has(page.status)
      ||!isOptionalString(page.imageUrl)
      ||!isOptionalString(page.alt)
      ||!isOptionalString(page.error)) return false;
    return page.status!=='succeeded'||isNonEmptyString(page.imageUrl);
  });
}

async function parseJson(response:Response):Promise<unknown>{
  try{
    return await response.json();
  }catch{
    return undefined;
  }
}

function errorMessage(status:number,body:unknown,fallback:string):string{
  if(status<400||status>=500||!isRecord(body)||typeof body.error!=='string') return fallback;
  const message=body.error.trim();
  return SAFE_BUSINESS_ERRORS.has(message)?message:fallback;
}

async function requestJson(
  url:string,
  init:RequestInit,
  fallback:string,
  externalSignal?:AbortSignal,
):Promise<unknown>{
  const requestController=new AbortController();
  let timedOut=false;
  const abortFromCaller=()=>requestController.abort();
  const timeoutId=window.setTimeout(()=>{
    timedOut=true;
    requestController.abort();
  },REQUEST_TIMEOUT_MS);

  if(externalSignal?.aborted){
    abortFromCaller();
  }else{
    externalSignal?.addEventListener('abort',abortFromCaller,{once:true});
  }

  try{
    const response=await fetch(url,{...init,signal:requestController.signal});
    const body=await parseJson(response);
    if(!response.ok){
      throw new ApiError(response.status,errorMessage(response.status,body,fallback));
    }
    if(body===undefined){
      throw new ApiError(response.status,fallback);
    }
    return body;
  }catch(reason:unknown){
    if(reason instanceof ApiError) throw reason;
    const message=timedOut
      ?REQUEST_TIMEOUT_MESSAGE
      :externalSignal?.aborted
        ?REQUEST_ABORTED_MESSAGE
        :NETWORK_ERROR_MESSAGE;
    const error=new ApiError(0,message);
    error.cause=reason;
    throw error;
  }finally{
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort',abortFromCaller);
  }
}

export async function uploadReferenceFiles(
  files:readonly File[],
  signal?:AbortSignal,
):Promise<ReferenceAsset[]>{
  if(files.length===0) return [];

  const formData=new FormData();
  for(const file of files) formData.append('files',file);
  const body=await requestJson(
    '/api/reference-assets',
    {method:'POST',body:formData},
    '参考图上传失败，请稍后重试',
    signal,
  );
  if(!isRecord(body)||!Array.isArray(body.assets)||!body.assets.every(isReferenceAsset)){
    throw new ApiError(200,'参考图上传失败，请稍后重试');
  }
  return body.assets;
}

export async function generateMarketingAssets(
  request:GenerateRequest,
  signal?:AbortSignal,
):Promise<GenerateResponse>{
  const payload:GenerateRequest={
    templateId:request.templateId,
    userPrompt:request.userPrompt,
    referenceAssetIds:request.referenceAssetIds,
  };
  const body=await requestJson(
    '/api/generate',
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
    },
    '素材生成失败，请稍后重试',
    signal,
  );
  if(!isGenerateResponse(body)){
    throw new ApiError(200,'素材生成失败，请稍后重试');
  }
  return body;
}
