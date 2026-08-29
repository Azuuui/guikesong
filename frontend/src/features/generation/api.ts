import type {
  GenerateRequest,
  GenerateResult,
  IpProfilePublicOutput,
  ReferenceAsset,
  WorkflowPageBase,
} from '../../../../shared/types';
import {WORKFLOW_IDS} from '../../../../shared/types';

const NETWORK_ERROR_MESSAGE='网络连接失败，请稍后重试';
const REQUEST_ABORTED_MESSAGE='请求已中止，请重新操作';
const REQUEST_TIMEOUT_MESSAGE='请求超时，请稍后重试';
const UPLOAD_TIMEOUT_MS=30_000;
/** 生成是长耗时同步请求：独立 10 分钟超时，不与上传共用。 */
export const GENERATE_REQUEST_TIMEOUT_MS=600_000;
const REFERENCE_MEDIA_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const PAGE_STATUSES=new Set(['succeeded','failed']);
const RESULT_STATUSES=new Set(['succeeded','partial']);
const IP_PAGE_ROLES=new Set(['brand-cover','identity-system','product-system','scene-application','overview']);
const XHS_PAGE_ROLES=new Set(['cover','content']);
const TRAVEL_GUIDE_PAGE_ROLES=new Set(['cover','route','transport','stay','food']);
const UGC_PAGE_ROLES=new Set(['poster']);
const SAFE_BUSINESS_ERRORS=new Set([
  '请上传图片',
  '仅支持 JPG、PNG、WebP',
  '图片签名无效',
  '单张图片不能超过 10MB',
  '参考图最多 4 张',
  '参考图不存在或已过期，请重新上传',
  '请上传 IP 标准图',
  '请输入 IP 名称',
  'IP 名称不超过 50 字',
  '请输入 IP 描述',
  'IP 描述不超过 500 字',
  '尚未创建 IP 档案',
  'IP 档案已锁定，无法修改',
  'IP 档案未锁定，无法生成',
  'IP 档案已更新，请刷新后重试',
  '未知工作流',
  'IP 档案或产品图缺失',
  '请输入产品描述',
  '产品描述不超过 500 字',
  '请输入选题',
  '选题需包含数量，如"贵阳的12种美食"',
  '选题数量至少为 2',
  '请输入目的地，如"成都"或"杭州西湖"',
  '目的地不超过 30 字',
  '目的地范围过大，请输入城市或景点，如"成都"或"杭州西湖"',
  '请输入一个具体的目的地，如"成都"或"杭州西湖"',
  '请上传 1～7 张投稿照片',
  '投稿照片最多 7 张',
  '活动主题不超过 50 字',
  '投稿昵称不超过 30 字',
  '投稿昵称数量需与照片数量一致',
]);

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

function isStringArray(value:unknown):value is string[]{
  return Array.isArray(value)&&value.every(item=>typeof item==='string');
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

function isWorkflowPage(value:unknown,roles:ReadonlySet<string>):value is WorkflowPageBase&{role:string}{
  if(!isRecord(value)) return false;
  if(!isNonEmptyString(value.id)
    ||typeof value.role!=='string'
    ||!roles.has(value.role)
    ||typeof value.filename!=='string'
    ||typeof value.status!=='string'
    ||!PAGE_STATUSES.has(value.status)
    ||!isOptionalString(value.imageUrl)
    ||!isOptionalString(value.alt)
    ||!isOptionalString(value.error)) return false;
  return value.status!=='succeeded'||isNonEmptyString(value.imageUrl);
}

function isIpProfilePublicOutput(value:unknown):value is IpProfilePublicOutput{
  if(!isRecord(value)) return false;
  return isNonEmptyString(value.ipProfileId)
    &&typeof value.version==='number'
    &&Number.isFinite(value.version)
    &&value.version>=1
    &&isNonEmptyString(value.name)
    &&isNonEmptyString(value.referenceImageUrl)
    &&isNonEmptyString(value.description)
    &&(value.status==='draft'||value.status==='locked');
}

function isAtlasListItem(value:unknown):boolean{
  if(!isRecord(value)) return false;
  return ['no','tag','name','line1','line2','punch','illustrationHint']
    .every(field=>typeof value[field]==='string'&&value[field].length>0);
}

function isAtlasList(value:unknown):boolean{
  if(!isRecord(value)) return false;
  const {meta,cover,items}=value;
  if(!isRecord(meta)||!isRecord(cover)||!Array.isArray(items)) return false;
  if(!isNonEmptyString(meta.userTitle)
    ||typeof meta.count!=='number'
    ||!isNonEmptyString(meta.measureWord)
    ||!isNonEmptyString(meta.domainType)
    ||!isNonEmptyString(meta.orgDimension)
    ||!isNonEmptyString(meta.themeWord)
    ||!Array.isArray(meta.fieldLabels)
    ||meta.fieldLabels.length!==2
    ||!meta.fieldLabels.every(label=>typeof label==='string')
    ||!isNonEmptyString(meta.motif)
    ||!isNonEmptyString(meta.palette)
    ||!Array.isArray(meta.pageSlogans)
    ||meta.pageSlogans.length!==6
    ||!meta.pageSlogans.every(slogan=>typeof slogan==='string')) return false;
  if(!isNonEmptyString(cover.titleLine1)
    ||!isNonEmptyString(cover.titleLine2)
    ||!isNonEmptyString(cover.highlightWord)
    ||!isNonEmptyString(cover.stickyNote)
    ||!isNonEmptyString(cover.bottomSlogan)) return false;
  return items.every(item=>isAtlasListItem(item));
}

/** 校验三候选标题结构（travel-guide / ugc-photo-campaign / xhs-atlas 共用）。 */
function isThreeTitles(value:unknown):value is string[]{
  return Array.isArray(value)
    &&value.length===3
    &&value.every((title:unknown)=>typeof title==='string'&&title.length>0);
}

function isTravelGuideTopSpot(value:unknown):boolean{
  if(!isRecord(value)) return false;
  return isNonEmptyString(value.name)&&isNonEmptyString(value.oneLiner);
}

function isTravelGuideDayPlan(value:unknown):boolean{
  if(!isRecord(value)) return false;
  const {route,links,tips}=value;
  return typeof value.day==='number'
    &&Number.isInteger(value.day)
    &&value.day>=1
    &&isNonEmptyString(value.theme)
    &&isNonEmptyString(value.slogan)
    &&Array.isArray(route)
    &&route.every(stop=>isRecord(stop)
      &&typeof stop.order==='number'
      &&isNonEmptyString(stop.spot)
      &&typeof stop.desc==='string')
    &&Array.isArray(links)
    &&links.every(link=>isRecord(link)
      &&typeof link.from==='number'
      &&typeof link.to==='number')
    &&Array.isArray(tips)
    &&isStringArray(tips);
}

/** travel-guide 行程 JSON 守卫：校验 UI 渲染依赖的结构完整性。 */
function isTravelGuideTrip(value:unknown):boolean{
  if(!isRecord(value)) return false;
  const {cover,dayPlans,transport,stay,food}=value;
  if(!isNonEmptyString(value.destination)
    ||typeof value.days!=='number'
    ||!Number.isInteger(value.days)
    ||value.days<1
    ||value.days>3
    ||!isNonEmptyString(value.vibe)
    ||!isNonEmptyString(value.tocNote)) return false;
  if(!isRecord(cover)
    ||!isNonEmptyString(cover.titleLine1)
    ||!isNonEmptyString(cover.titleLine2)
    ||!isNonEmptyString(cover.subtitle)
    ||!Array.isArray(cover.topSpots)
    ||!cover.topSpots.every(isTravelGuideTopSpot)) return false;
  if(!Array.isArray(dayPlans)
    ||dayPlans.length!==value.days
    ||!dayPlans.every(isTravelGuideDayPlan)) return false;
  if(!isRecord(transport)
    ||!Array.isArray(transport.arrival)
    ||!Array.isArray(transport.local)
    ||!transport.arrival.every(item=>isRecord(item)&&isNonEmptyString(item.way)&&isNonEmptyString(item.detail))
    ||!transport.local.every(item=>isRecord(item)&&isNonEmptyString(item.way)&&isNonEmptyString(item.detail))
    ||!isNonEmptyString(transport.pitfall)
    ||!isNonEmptyString(transport.slogan)) return false;
  if(!isRecord(stay)
    ||!Array.isArray(stay.areas)
    ||!stay.areas.every(area=>isRecord(area)&&isNonEmptyString(area.area)&&isNonEmptyString(area.fit)&&isNonEmptyString(area.why))
    ||!Array.isArray(stay.tiers)
    ||!stay.tiers.every(tier=>isRecord(tier)&&isNonEmptyString(tier.tier)&&isNonEmptyString(tier.range))
    ||!isNonEmptyString(stay.logic)
    ||!isNonEmptyString(stay.slogan)) return false;
  return isRecord(food)
    &&Array.isArray(food.items)
    &&food.items.every(item=>isRecord(item)&&isNonEmptyString(item.name)&&isNonEmptyString(item.eat)&&isNonEmptyString(item.where))
    &&isNonEmptyString(food.slogan);
}

/** ugc-photo-campaign 海报页守卫：附带第几张照片与投稿昵称。 */
function isUgcPhotoCampaignPage(value:unknown):boolean{
  if(!isWorkflowPage(value,UGC_PAGE_ROLES)) return false;
  const page=value as WorkflowPageBase&{role:string;photoIndex?:unknown;credit?:unknown};
  return typeof page.photoIndex==='number'
    &&Number.isInteger(page.photoIndex)
    &&page.photoIndex>=1
    &&isOptionalString(page.credit);
}

/** API 运行时守卫：按 workflowId 校验专属 copy、pages 与 artifacts。 */
function isGenerateResult(value:unknown):value is GenerateResult{
  if(!isRecord(value)) return false;
  if(!isNonEmptyString(value.requestId)
    ||typeof value.workflowId!=='string'
    ||!(WORKFLOW_IDS as readonly string[]).includes(value.workflowId)
    ||typeof value.status!=='string'
    ||!RESULT_STATUSES.has(value.status)
    ||!isRecord(value.copy)
    ||!Array.isArray(value.pages)
    ||!isStringArray(value.warnings)) return false;

  if(value.workflowId==='original-ip'){
    const {copy}=value;
    if(typeof copy.title!=='string'
      ||typeof copy.body!=='string'
      ||!isStringArray(copy.tags)
      ||!isNonEmptyString(value.ipProfileId)
      ||typeof value.ipProfileVersion!=='number'
      ||(value.overview!==undefined&&!(
        isRecord(value.overview)&&isNonEmptyString(value.overview.pageId)&&isNonEmptyString(value.overview.filename)
      ))) return false;
    return value.pages.every(page=>isWorkflowPage(page,IP_PAGE_ROLES));
  }

  if(value.workflowId==='travel-guide'){
    const {copy}=value;
    if(!isThreeTitles(copy.titles)
      ||typeof copy.body!=='string'
      ||!isStringArray(copy.tags)
      ||!isNonEmptyString(value.destination)
      ||typeof value.days!=='number'
      ||!isTravelGuideTrip(value.trip)) return false;
    return value.pages.every(page=>isWorkflowPage(page,TRAVEL_GUIDE_PAGE_ROLES));
  }

  if(value.workflowId==='ugc-photo-campaign'){
    const {copy}=value;
    if(!isThreeTitles(copy.titles)
      ||typeof copy.body!=='string'
      ||!isStringArray(copy.tags)
      ||!isNonEmptyString(value.mood)
      ||!isOptionalString(value.campaignTheme)) return false;
    return value.pages.every(isUgcPhotoCampaignPage);
  }

  const {copy}=value;
  if(!Array.isArray(copy.titles)
    ||copy.titles.length!==3
    ||!copy.titles.every((title:unknown)=>typeof title==='string')
    ||typeof copy.body!=='string'
    ||!isStringArray(copy.tags)
    ||!isNonEmptyString(value.topic)
    ||!isAtlasList(value.list)) return false;
  return value.pages.every(page=>isWorkflowPage(page,XHS_PAGE_ROLES));
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
  timeoutMs:number=UPLOAD_TIMEOUT_MS,
):Promise<unknown>{
  const requestController=new AbortController();
  let timedOut=false;
  const abortFromCaller=()=>requestController.abort();
  const timeoutId=window.setTimeout(()=>{
    timedOut=true;
    requestController.abort();
  },timeoutMs);

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

export async function getActiveIpProfile(
  signal?:AbortSignal,
):Promise<IpProfilePublicOutput|null>{
  let body:unknown;
  try{
    body=await requestJson(
      '/api/ip-profiles/active',
      {method:'GET'},
      'IP 档案读取失败，请稍后重试',
      signal,
    );
  }catch(error){
    if(error instanceof ApiError&&error.status===404) return null;
    throw error;
  }
  if(!isIpProfilePublicOutput(body)){
    throw new ApiError(200,'IP 档案读取失败，请稍后重试');
  }
  return body;
}

export async function createIpProfile(
  input:{file:File;name:string;description:string},
  signal?:AbortSignal,
):Promise<IpProfilePublicOutput>{
  const formData=new FormData();
  formData.append('file',input.file);
  formData.append('name',input.name);
  formData.append('description',input.description);
  const body=await requestJson(
    '/api/ip-profiles',
    {method:'POST',body:formData},
    'IP 档案保存失败，请稍后重试',
    signal,
  );
  if(!isIpProfilePublicOutput(body)){
    throw new ApiError(200,'IP 档案保存失败，请稍后重试');
  }
  return body;
}

export async function lockIpProfile(
  ipProfileId:string,
  signal?:AbortSignal,
):Promise<IpProfilePublicOutput>{
  const body=await requestJson(
    `/api/ip-profiles/${encodeURIComponent(ipProfileId)}/lock`,
    {method:'POST'},
    'IP 档案锁定失败，请稍后重试',
    signal,
  );
  if(!isIpProfilePublicOutput(body)){
    throw new ApiError(200,'IP 档案锁定失败，请稍后重试');
  }
  return body;
}

export async function generateAssets(
  request:GenerateRequest,
  signal?:AbortSignal,
):Promise<GenerateResult>{
  const body=await requestJson(
    '/api/generate',
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(request),
    },
    '素材生成失败，请稍后重试',
    signal,
    GENERATE_REQUEST_TIMEOUT_MS,
  );
  if(!isGenerateResult(body)){
    throw new ApiError(200,'素材生成失败，请稍后重试');
  }
  return body;
}
