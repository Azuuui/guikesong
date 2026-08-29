import {useEffect,useRef,useState} from 'react';
import type {GenerateRequest,IpProfilePublicOutput,ReferenceAsset,WorkflowId} from '../../../../shared/types';
import {travelGuideDestinationError} from '../../../../shared/workflowSchemas';
import {findXhsAtlasTopicQuantity} from '../../../../shared/xhsAtlasTopicQuantity';
import {useGenerationJob} from '../generation/GenerationJobProvider';
import {ApiError,getActiveIpProfile,uploadReferenceFiles} from '../generation/api';
import type {HomeAttachment as HomeComposerAttachment} from './HomeComposer';

const ALLOWED_MEDIA_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const MAX_FILE_BYTES=10*1024*1024;

/** 各工作流在主页可添加的图片数量上限与超限提示。 */
const WORKFLOW_FILE_RULES:Record<WorkflowId,{maxFiles:number;overflowMessage:string}>={
  'original-ip':{maxFiles:1,overflowMessage:'原创 IP 只能添加 1 张产品图片。'},
  'xhs-atlas':{maxFiles:4,overflowMessage:'小红书图鉴最多添加 4 张参考图。'},
  'travel-guide':{maxFiles:0,overflowMessage:'手绘攻略不需要参考图片，直接输入目的地即可。'},
  'ugc-photo-campaign':{maxFiles:7,overflowMessage:'游客返图最多添加 7 张照片。'},
};

type Navigate=(to:string,options?:{state?:unknown;replace?:boolean})=>void;

export type HomeGenerationDependencies={
  createObjectURL:(file:Blob)=>string;
  revokeObjectURL:(url:string)=>void;
  getActiveIpProfile:(signal?:AbortSignal)=>Promise<IpProfilePublicOutput|null>;
  uploadReferenceFiles:(files:readonly File[],signal?:AbortSignal)=>Promise<ReferenceAsset[]>;
};

const DEFAULT_DEPENDENCIES:HomeGenerationDependencies={
  createObjectURL:file=>URL.createObjectURL(file),
  revokeObjectURL:url=>URL.revokeObjectURL(url),
  getActiveIpProfile,
  uploadReferenceFiles,
};

export type UseHomeGenerationOptions={
  /** 初始选中模板；缺省时无选中，直到用户点选模板。 */
  initialWorkflowId?:WorkflowId;
  navigate:Navigate;
  dependencies?:HomeGenerationDependencies;
};

export type HomeAttachment=HomeComposerAttachment&{file:File};

function validationMessage(workflowId:WorkflowId,prompt:string,files:readonly HomeAttachment[]):string|undefined{
  if(prompt.trim().length<2) return '请至少输入 2 个字。';
  if(workflowId==='xhs-atlas'){
    const quantity=findXhsAtlasTopicQuantity(prompt);
    if(!quantity) return '图鉴选题需包含数量，如“贵阳的12种美食”。';
    if(quantity.count<2) return '图鉴选题数量至少为 2。';
    if(files.length>4) return '小红书图鉴最多添加 4 张参考图。';
    return;
  }
  if(workflowId==='original-ip'){
    if(files.length!==1) return '原创 IP 创作需要添加 1 张产品图片。';
    return;
  }
  if(workflowId==='travel-guide'){
    const destinationError=travelGuideDestinationError(prompt);
    if(destinationError) return destinationError;
    if(files.length>0) return '手绘攻略不需要参考图片，直接输入目的地即可。';
    return;
  }
  if(files.length<1) return '游客返图需要至少 1 张照片。';
  if(files.length>7) return '游客返图最多添加 7 张照片。';
  return;
}

function isPendingStatus(status:'queued'|'running'|'succeeded'|'partial'|'failed'):boolean{
  return status==='queued'||status==='running';
}

export function useHomeGeneration({
  dependencies=DEFAULT_DEPENDENCIES,
  initialWorkflowId,
  navigate,
}:UseHomeGenerationOptions){
  const {activeJob,startGeneration}=useGenerationJob();
  const [selectedWorkflowId,setSelectedWorkflowId]=useState<WorkflowId|undefined>(initialWorkflowId);
  const [prompt,setPrompt]=useState('');
  const [attachments,setAttachments]=useState<HomeAttachment[]>([]);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState<string>();
  const controllerRef=useRef<AbortController|undefined>(undefined);
  const previewUrlsRef=useRef(new Set<string>());
  const mountedRef=useRef(true);

  // busy 拆分为「本地上传中」与「后台任务未终态」；任务期间保留输入与模板选择。
  const jobPending=activeJob!==null&&isPendingStatus(activeJob.status);
  const busy=uploading||jobPending;

  useEffect(()=>()=>{
    mountedRef.current=false;
    controllerRef.current?.abort();
    previewUrlsRef.current.forEach(url=>dependencies.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  },[dependencies]);

  function selectWorkflow(workflowId:WorkflowId){
    if(busy) return;
    setSelectedWorkflowId(workflowId);
    setError(undefined);
  }

  function addFiles(files:readonly File[]){
    if(busy||files.length===0) return;
    if(!selectedWorkflowId){
      setError('请先在下方选择一个模板。');
      return;
    }
    const invalidType=files.find(file=>!ALLOWED_MEDIA_TYPES.has(file.type));
    if(invalidType){
      setError('仅支持 JPG、PNG、WebP 图片。');
      return;
    }
    const oversized=files.find(file=>file.size>MAX_FILE_BYTES);
    if(oversized){
      setError('单张图片不能超过 10MB。');
      return;
    }
    const {maxFiles,overflowMessage}=WORKFLOW_FILE_RULES[selectedWorkflowId];
    if(attachments.length+files.length>maxFiles){
      setError(overflowMessage);
      return;
    }
    const next=files.map((file,index)=>{
      const previewUrl=dependencies.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return {
        id:`home-${Date.now()}-${index}-${file.name}`,
        file,
        name:file.name,
        previewUrl,
        status:'pending' as const,
      };
    });
    setAttachments(current=>[...current,...next]);
    setError(undefined);
  }

  function removeAttachment(id:string){
    if(busy) return;
    setAttachments(current=>current.filter(attachment=>{
      if(attachment.id!==id) return true;
      dependencies.revokeObjectURL(attachment.previewUrl);
      previewUrlsRef.current.delete(attachment.previewUrl);
      return false;
    }));
    setError(undefined);
  }

  async function submit(){
    if(busy) return;
    if(!selectedWorkflowId){
      setError('请先在下方选择一个模板。');
      return;
    }
    const normalizedPrompt=prompt.trim();
    const selectedAttachments=[...attachments];
    const nextError=validationMessage(selectedWorkflowId,normalizedPrompt,selectedAttachments);
    if(nextError){
      setError(nextError);
      return;
    }

    const controller=new AbortController();
    controllerRef.current=controller;
    setUploading(true);
    setError(undefined);
    let stage:'profile'|'upload'|'job'='profile';

    try{
      let request:GenerateRequest;
      let assets:ReferenceAsset[]=[];
      if(selectedWorkflowId==='original-ip'){
        const profile=await dependencies.getActiveIpProfile(controller.signal);
        if(!mountedRef.current||controller.signal.aborted) return;
        if(!profile||profile.status!=='locked'){
          navigate('/templates/original-ip/create',{state:{
            initialPrompt:normalizedPrompt,
            restoredFiles:selectedAttachments.map(({file})=>({name:file.name,mediaType:file.type,blob:file})),
          }});
          return;
        }
        stage='upload';
        setAttachments(current=>current.map(attachment=>({...attachment,status:'uploading'})));
        assets=await dependencies.uploadReferenceFiles(selectedAttachments.map(item=>item.file),controller.signal);
        if(assets.length!==1) throw new Error('产品图上传结果数量不一致');
        setAttachments(current=>current.map(attachment=>({...attachment,status:'uploaded'})));
        request={
          workflowId:'original-ip',
          ipProfileId:profile.ipProfileId,
          productAssetId:assets[0]!.assetId,
          productDescription:normalizedPrompt,
        };
      }else if(selectedWorkflowId==='travel-guide'){
        request={workflowId:'travel-guide',destination:normalizedPrompt};
      }else if(selectedWorkflowId==='ugc-photo-campaign'){
        stage='upload';
        setAttachments(current=>current.map(attachment=>({...attachment,status:'uploading'})));
        assets=await dependencies.uploadReferenceFiles(selectedAttachments.map(item=>item.file),controller.signal);
        if(assets.length!==selectedAttachments.length) throw new Error('投稿照片上传结果数量不一致');
        setAttachments(current=>current.map(attachment=>({...attachment,status:'uploaded'})));
        request={
          workflowId:'ugc-photo-campaign',
          photoAssetIds:assets.map(asset=>asset.assetId),
          campaignTheme:normalizedPrompt,
        };
      }else{
        if(selectedAttachments.length>0){
          stage='upload';
          setAttachments(current=>current.map(attachment=>({...attachment,status:'uploading'})));
          assets=await dependencies.uploadReferenceFiles(selectedAttachments.map(item=>item.file),controller.signal);
          if(assets.length!==selectedAttachments.length) throw new Error('参考图上传结果数量不一致');
          setAttachments(current=>current.map(attachment=>({...attachment,status:'uploaded'})));
        }
        request={workflowId:'xhs-atlas',topic:normalizedPrompt,referenceAssetIds:assets.map(asset=>asset.assetId)};
      }

      // 上传完成后创建后台任务；轮询、历史保存与结果页跳转由应用级 Provider 负责。
      stage='job';
      await startGeneration({
        request,
        userPrompt:normalizedPrompt,
        referenceFiles:assets.map((asset,index)=>({asset,blob:selectedAttachments[index]!.file})),
      });
    }catch(reason){
      if(controller.signal.aborted||!mountedRef.current) return;
      if(stage==='upload'){
        setAttachments(current=>current.map(attachment=>({...attachment,status:'failed'})));
      }
      const message=reason instanceof ApiError&&reason.message
        ?reason.message
        :stage==='profile'
          ?'IP 档案读取失败，请稍后重试。'
          :stage==='upload'
            ?'图片上传失败，请稍后重试。'
            :'素材生成失败，请稍后重试。';
      setError(message);
    }finally{
      if(controllerRef.current===controller) controllerRef.current=undefined;
      if(mountedRef.current) setUploading(false);
    }
  }

  return {
    selectedWorkflowId,
    prompt,
    attachments,
    busy,
    error,
    setPrompt,
    selectWorkflow,
    addFiles,
    removeAttachment,
    submit,
  };
}
