import type {
  GenerateResult,
  OriginalIpPageRole,
  OriginalIpResult,
  XhsAtlasPageRole,
  XhsAtlasResult,
} from '../../../shared/types';
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

export type MakeResultOptions={
  failedIndexes?:number[];
  pageCount?:number;
  requestId?:string;
};

const ORIGINAL_IP_ROLES:OriginalIpPageRole[]=[
  'brand-cover',
  'identity-system',
  'product-system',
  'scene-application',
];

const XHS_ATLAS_ROLES:XhsAtlasPageRole[]=['cover','content'];

export function makeOriginalIpResult(options:MakeResultOptions={}):OriginalIpResult{
  const failed=new Set(options.failedIndexes??[]);
  const pageCount=options.pageCount??4;
  const pages=Array.from({length:pageCount},(_,index)=>{
    const isOverview=index>=ORIGINAL_IP_ROLES.length;
    return {
      id:`page-${index+1}`,
      role:isOverview?'overview' as const:ORIGINAL_IP_ROLES[index],
      filename:isOverview?`original-ip-overview-${index+1-ORIGINAL_IP_ROLES.length}.svg`:`original-ip-${index+1}.svg`,
      status:failed.has(index)?'failed' as const:'succeeded' as const,
      imageUrl:failed.has(index)?undefined:`data:image/svg+xml,fixture-${index+1}`,
      error:failed.has(index)?'图片生成服务暂时不可用':undefined,
      alt:`贵州夏季避暑宣传第 ${index+1} 页`,
    };
  });
  const overviewPage=pages.find(page=>page.role==='overview'&&page.status==='succeeded');
  return {
    requestId:options.requestId??'request-fixture',
    workflowId:'original-ip',
    status:failed.size?'partial':'succeeded',
    copy:{
      title:'贵州夏季避暑宣传',
      body:'面向年轻游客的夏季避暑内容。',
      tags:['贵州旅行','夏季避暑'],
    },
    ipProfileId:'profile-1',
    ipProfileVersion:1,
    pages,
    overview:overviewPage?{pageId:overviewPage.id,filename:overviewPage.filename}:undefined,
    warnings:failed.size?['部分图片生成失败']:[],
  };
}

export function makeXhsAtlasResult(options:MakeResultOptions={}):XhsAtlasResult{
  const failed=new Set(options.failedIndexes??[]);
  const pageCount=options.pageCount??2;
  return {
    requestId:options.requestId??'request-fixture',
    workflowId:'xhs-atlas',
    status:failed.size?'partial':'succeeded',
    copy:{
      titles:['贵阳美食图鉴来了','12种贵阳必吃美食','收藏这份贵阳美食清单'],
      body:'按场景整理的贵阳美食清单正文。',
      tags:['#贵阳美食','#干货分享'],
    },
    topic:'贵阳的12种美食',
    list:{
      meta:{
        userTitle:'贵阳的12种美食',
        count:12,
        measureWord:'种',
        domainType:'美食盘点',
        orgDimension:'按食用场景',
        themeWord:'美食',
        fieldLabels:['怎么吃','避坑'],
        motif:'一碗热气',
        palette:'美食暖橙',
        pageSlogans:['一','二','三','四','五','六'],
      },
      cover:{
        titleLine1:'贵阳的',
        titleLine2:'12种美食',
        highlightWord:'12种',
        stickyNote:'一共12种',
        bottomSlogan:'收藏这份清单',
      },
      items:Array.from({length:12},(_,index)=>({
        no:String(index+1).padStart(2,'0'),
        tag:index<6?'早餐':'小吃',
        name:`美食${index+1}`,
        line1:`第${index+1}行文案`,
        line2:`第${index+1}行提示`,
        punch:`金句${index+1}`,
        illustrationHint:`美食${index+1}插画`,
      })),
    },
    pages:Array.from({length:pageCount},(_,index)=>({
      id:`page-${index+1}`,
      role:XHS_ATLAS_ROLES[Math.min(index,XHS_ATLAS_ROLES.length-1)],
      filename:`xhs-atlas-${index+1}.svg`,
      status:failed.has(index)?'failed':'succeeded',
      imageUrl:failed.has(index)?undefined:`data:image/svg+xml,fixture-${index+1}`,
      error:failed.has(index)?'图片生成服务暂时不可用':undefined,
      alt:`贵阳美食图鉴第 ${index+1} 页`,
    })),
    warnings:failed.size?['部分图片生成失败']:[],
  };
}

export function makeGenerateResult(options:MakeResultOptions & {workflowId?:'original-ip'|'xhs-atlas'}={}):GenerateResult{
  return options.workflowId==='xhs-atlas'
    ?makeXhsAtlasResult(options)
    :makeOriginalIpResult(options);
}

export function makeHistoryRecord(index=0,result:GenerateResult=makeOriginalIpResult()):HistoryRecord{
  const id=`request-${index}`;
  const createdAt=new Date(Date.UTC(2026,7,29,5,index)).toISOString();
  if(result.workflowId==='original-ip'){
    return {
      id,
      createdAt,
      workflowId:'original-ip',
      userPrompt:'贵州夏季避暑宣传',
      result:{...result,requestId:id},
      pageBlobs:[],
      productFile:{
        asset:{
          assetId:'asset-product',
          url:'/api/reference-assets/asset-product',
          originalName:'product.png',
          mediaType:'image/png',
          size:8,
          createdAt:'2026-08-29T00:00:00.000Z',
        },
        blob:new Blob(['product'],{type:'image/png'}),
      },
    };
  }
  return {
    id,
    createdAt,
    workflowId:'xhs-atlas',
    userPrompt:'贵阳的12种美食',
    result:{...result,requestId:id},
    pageBlobs:[],
    referenceFiles:[],
  };
}
