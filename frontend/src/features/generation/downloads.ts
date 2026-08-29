import JSZip from 'jszip';
import type {GeneratedPage,GenerateResponse} from '../../../../shared/types';

export type CopyResult=
  |{ok:true}
  |{ok:false;message:string};

export class DownloadError extends Error{
  constructor(public status:number,message:string){
    super(message);
    this.name='DownloadError';
  }
}

export async function copyText(text:string):Promise<CopyResult>{
  if(!navigator.clipboard?.writeText){
    return {ok:false,message:'当前浏览器不支持复制，请手动选择文案'};
  }
  try{
    await navigator.clipboard.writeText(text);
    return {ok:true};
  }catch{
    return {ok:false,message:'复制失败，请手动选择文案'};
  }
}

async function fetchBlob(url:string,fallbackMessage:string):Promise<Blob>{
  let response:Response;
  try{
    response=await fetch(url);
  }catch(reason:unknown){
    const error=new DownloadError(0,fallbackMessage);
    error.cause=reason;
    throw error;
  }
  if(!response.ok) throw new DownloadError(response.status,fallbackMessage);
  try{
    return await response.blob();
  }catch(reason:unknown){
    const error=new DownloadError(response.status,fallbackMessage);
    error.cause=reason;
    throw error;
  }
}

function triggerBlobDownload(blob:Blob,filename:string):void{
  let objectUrl:string|undefined;
  const anchor=document.createElement('a');
  try{
    objectUrl=URL.createObjectURL(blob);
    anchor.href=objectUrl;
    anchor.download=filename;
    document.body.append(anchor);
    anchor.click();
  }finally{
    anchor.remove();
    if(objectUrl!==undefined) URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadPage(page:GeneratedPage):Promise<void>{
  if(page.status!=='succeeded'||!page.imageUrl){
    throw new DownloadError(0,'当前图片尚未生成成功');
  }
  const blob=await fetchBlob(page.imageUrl,'图片下载失败，请稍后重试');
  triggerBlobDownload(blob,page.filename);
}

function packageCopy(response:GenerateResponse):string{
  const {title,body,tags}=response.copy;
  return `标题：${title}\n正文：${body}\n标签：${tags.join('、')}`;
}

export async function buildPackage(response:GenerateResponse):Promise<Blob>{
  const zip=new JSZip();
  zip.file('文案.txt',packageCopy(response));

  for(const page of response.pages){
    if(page.status!=='succeeded') continue;
    if(!page.imageUrl){
      throw new DownloadError(0,'素材包图片下载失败，请稍后重试');
    }
    const blob=await fetchBlob(page.imageUrl,'素材包图片下载失败，请稍后重试');
    zip.file(page.filename,blob);
  }

  return await zip.generateAsync({type:'blob'});
}

export async function downloadPackage(response:GenerateResponse):Promise<void>{
  const blob=await buildPackage(response);
  triggerBlobDownload(blob,`文旅素材-${response.requestId}.zip`);
}
