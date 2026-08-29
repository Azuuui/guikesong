import JSZip from 'jszip';
import type {GenerateResult,WorkflowPageBase} from '../../../../shared/types';

export const IMAGE_FETCH_TIMEOUT_MS=30_000;
export const MAX_IMAGE_BYTES=25*1024*1024;
export const MAX_PACKAGE_IMAGE_BYTES=200*1024*1024;
export const MAX_PACKAGE_PAGES=100;

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

async function fetchImageBlob(url:string,fallbackMessage:string):Promise<Blob>{
  const controller=new AbortController();
  const timeoutId=globalThis.setTimeout(()=>controller.abort(),IMAGE_FETCH_TIMEOUT_MS);
  let status=0;
  try{
    const response=await fetch(url,{signal:controller.signal});
    status=response.status;
    if(!response.ok) throw new DownloadError(status,fallbackMessage);
    const contentType=response.headers.get('Content-Type')?.trim();
    const mediaType=contentType?.split(';',1)[0].trim().toLowerCase();
    if(!contentType||!mediaType?.startsWith('image/')){
      await response.body?.cancel().catch(()=>undefined);
      throw new DownloadError(status,fallbackMessage);
    }
    const contentLength=response.headers.get('Content-Length');
    const declaredBytes=contentLength===null?undefined:Number(contentLength);
    if(declaredBytes!==undefined&&Number.isFinite(declaredBytes)&&declaredBytes>MAX_IMAGE_BYTES){
      await response.body?.cancel().catch(()=>undefined);
      throw new DownloadError(status,fallbackMessage);
    }

    if(response.body){
      const reader=response.body.getReader();
      const chunks:ArrayBuffer[]=[];
      let receivedBytes=0;
      try{
        while(true){
          const {done,value}=await reader.read();
          if(done) break;
          receivedBytes+=value.byteLength;
          if(receivedBytes>MAX_IMAGE_BYTES){
            await reader.cancel().catch(()=>undefined);
            throw new DownloadError(status,fallbackMessage);
          }
          const chunk=new Uint8Array(value.byteLength);
          chunk.set(value);
          chunks.push(chunk.buffer);
        }
      }finally{
        reader.releaseLock();
      }
      return new Blob(chunks,{type:contentType});
    }

    // 少数测试/旧环境没有 ReadableStream，只能在完整读取后复核；生产 fetch 通常走上面的流式硬上限。
    const blob=await response.blob();
    if(blob.size>MAX_IMAGE_BYTES) throw new DownloadError(status,fallbackMessage);
    return blob.type===contentType?blob:new Blob([blob],{type:contentType});
  }catch(reason:unknown){
    if(reason instanceof DownloadError) throw reason;
    const error=new DownloadError(status,fallbackMessage);
    error.cause=reason;
    throw error;
  }finally{
    globalThis.clearTimeout(timeoutId);
  }
}

function safeBasename(filename:string,fallback:string):string{
  const normalized=filename.replaceAll('\\','/');
  // eslint-disable-next-line no-control-regex -- 文件名需要剥离控制字符
  const basename=normalized.split('/').at(-1)?.replace(/[\u0000-\u001f\u007f]/gu,'').trim()??'';
  return basename&&basename!=='.'&&basename!=='..'?basename:fallback;
}

function withNumericSuffix(filename:string,suffix:number):string{
  const extensionIndex=filename.lastIndexOf('.');
  if(extensionIndex<=0) return `${filename}-${suffix}`;
  return `${filename.slice(0,extensionIndex)}-${suffix}${filename.slice(extensionIndex)}`;
}

function uniqueFilename(filename:string,used:Set<string>):string{
  let candidate=filename;
  let suffix=2;
  while(used.has(candidate.toLowerCase())){
    candidate=withNumericSuffix(filename,suffix);
    suffix+=1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
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

export async function downloadPage(page:WorkflowPageBase):Promise<void>{
  if(page.status!=='succeeded'||!page.imageUrl){
    throw new DownloadError(0,'当前图片尚未生成成功');
  }
  const blob=await fetchImageBlob(page.imageUrl,'图片下载失败，请稍后重试');
  const fallback=`图片-${safeBasename(page.id,'下载')}`;
  triggerBlobDownload(blob,safeBasename(page.filename,fallback));
}

function packageCopy(result:GenerateResult):string{
  const {body,tags}=result.copy;
  // 原创 IP 只有一个标题；图鉴导出 3 个候选标题供挑选。
  const titleBlock=result.workflowId==='original-ip'
    ?`标题：${result.copy.title}`
    :`候选标题：\n${result.copy.titles.join('\n')}`;
  return `${titleBlock}\n正文：${body}\n标签：${tags.join('、')}`;
}

export async function buildPackage(result:GenerateResult):Promise<Blob>{
  const successfulPages=result.pages.filter(page=>page.status==='succeeded');
  if(successfulPages.length>MAX_PACKAGE_PAGES){
    throw new DownloadError(0,'素材包图片过多，无法下载');
  }
  const zip=new JSZip();
  // 原创 IP 导出单一文案；图鉴导出可直接发布的文案与结构化清单。
  const copyFilename=result.workflowId==='original-ip'?'文案.txt':'发布文案.txt';
  zip.file(copyFilename,packageCopy(result));
  const usedFilenames=new Set([copyFilename.toLowerCase()]);
  if(result.workflowId==='xhs-atlas'){
    zip.file('清单.json',JSON.stringify(result.list,null,2));
    usedFilenames.add('清单.json');
  }
  let totalImageBytes=0;

  for(const [index,page] of successfulPages.entries()){
    if(!page.imageUrl){
      throw new DownloadError(0,'素材包图片下载失败，请稍后重试');
    }
    const blob=await fetchImageBlob(page.imageUrl,'素材包图片下载失败，请稍后重试');
    totalImageBytes+=blob.size;
    if(totalImageBytes>MAX_PACKAGE_IMAGE_BYTES){
      throw new DownloadError(0,'素材包过大，无法下载');
    }
    const basename=safeBasename(page.filename,`图片-${index+1}`);
    zip.file(uniqueFilename(basename,usedFilenames),blob);
  }

  return await zip.generateAsync({type:'blob'});
}

export async function downloadPackage(result:GenerateResult):Promise<void>{
  const blob=await buildPackage(result);
  const filename=safeBasename(`文旅素材-${result.requestId}.zip`,'文旅素材.zip');
  triggerBlobDownload(blob,filename);
}
