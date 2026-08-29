import type {
  GenerateRequest,
  GenerateResponse,
  ReferenceAsset,
} from '../../../../shared/types';

const NETWORK_ERROR_MESSAGE='网络连接失败，请稍后重试';

export class ApiError extends Error{
  constructor(public status:number,message:string){
    super(message);
    this.name='ApiError';
  }
}

function isSafeBusinessMessage(value:unknown):value is string{
  if(typeof value!=='string') return false;
  const message=value.trim();
  if(!message||message.length>200) return false;
  return !/(?:\r|\n|error|exception|stack|\bat\s|\/srv\/|token|secret|api[_ -]?key|https?:\/\/)/iu.test(message);
}

async function parseJson(response:Response):Promise<unknown>{
  try{
    return await response.json();
  }catch{
    return undefined;
  }
}

function errorMessage(body:unknown,fallback:string):string{
  if(typeof body!=='object'||body===null||!('error' in body)) return fallback;
  const error=body.error;
  return isSafeBusinessMessage(error)?error.trim():fallback;
}

async function requestJson(
  url:string,
  init:RequestInit,
  fallback:string,
):Promise<unknown>{
  let response:Response;
  try{
    response=await fetch(url,init);
  }catch(reason:unknown){
    const error=new ApiError(0,NETWORK_ERROR_MESSAGE);
    error.cause=reason;
    throw error;
  }

  const body=await parseJson(response);
  if(!response.ok){
    throw new ApiError(response.status,errorMessage(body,fallback));
  }
  if(body===undefined){
    throw new ApiError(response.status,fallback);
  }
  return body;
}

export async function uploadReferenceFiles(files:readonly File[]):Promise<ReferenceAsset[]>{
  if(files.length===0) return [];

  const formData=new FormData();
  for(const file of files) formData.append('files',file);
  const body=await requestJson(
    '/api/reference-assets',
    {method:'POST',body:formData},
    '参考图上传失败，请稍后重试',
  );
  if(typeof body!=='object'||body===null||!('assets' in body)||!Array.isArray(body.assets)){
    throw new ApiError(200,'参考图上传失败，请稍后重试');
  }
  return body.assets as ReferenceAsset[];
}

export async function generateMarketingAssets(request:GenerateRequest):Promise<GenerateResponse>{
  const payload:GenerateRequest={
    templateId:request.templateId,
    userPrompt:request.userPrompt,
    referenceAssetIds:request.referenceAssetIds,
  };
  return await requestJson(
    '/api/generate',
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
    },
    '素材生成失败，请稍后重试',
  ) as GenerateResponse;
}
