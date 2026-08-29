import type {
  GenerateResult,
  OriginalIpPageRole,
  OriginalIpResult,
  TravelGuideResult,
  UgcPhotoCampaignResult,
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

export function makeTravelGuideResult(options:MakeResultOptions={}):TravelGuideResult{
  const failed=new Set(options.failedIndexes??[]);
  const days=2;
  const pages=[
    {role:'cover' as const,day:undefined},
    ...Array.from({length:days},(_,index)=>({role:'route' as const,day:index+1})),
    {role:'transport' as const,day:undefined},
    {role:'stay' as const,day:undefined},
    {role:'food' as const,day:undefined},
  ].map((page,index)=>({
    id:`page-${index+1}`,
    role:page.role,
    ...(page.day!==undefined?{day:page.day}:{}),
    filename:`travel-guide-${page.role}${page.day!==undefined?`-${page.day}`:''}.svg`,
    status:failed.has(index)?'failed' as const:'succeeded' as const,
    imageUrl:failed.has(index)?undefined:`data:image/svg+xml,fixture-${index+1}`,
    error:failed.has(index)?'图片生成服务暂时不可用':undefined,
    alt:`成都手绘攻略第 ${index+1} 页`,
  }));
  return {
    requestId:options.requestId??'request-fixture',
    workflowId:'travel-guide',
    status:failed.size?'partial':'succeeded',
    copy:{
      titles:['成都两日手绘攻略','成都慢游手册','收藏这份成都攻略'],
      body:'按天整理的成都行程正文。',
      tags:['#成都','#手绘攻略'],
    },
    destination:'成都',
    days,
    trip:{
      destination:'成都',
      days,
      vibe:'市井与松弛',
      tocNote:'先看路线再讲吃住',
      cover:{
        titleLine1:'成都',
        titleLine2:'两日手绘攻略',
        subtitle:'市井与松弛',
        topSpots:[
          {name:'人民公园',oneLiner:'喝一碗盖碗茶'},
          {name:'宽窄巷子',oneLiner:'老成都的街巷'},
        ],
      },
      dayPlans:Array.from({length:days},(_,dayIndex)=>({
        day:dayIndex+1,
        theme:dayIndex===0?'老城漫步':'近郊风景',
        slogan:`成都第${dayIndex+1}天`,
        route:[
          {
            order:1,
            spot:dayIndex===0?'人民公园':'熊猫基地',
            desc:'慢逛半日',
            illustration:'竹椅茶馆',
            feature:'盖碗茶',
            hours:'2小时',
            ticket:'免费',
            recommend:'早上前往',
          },
        ],
        links:[{from:1,to:1,mode:'步行',duration:'10分钟'}],
        tips:['早去人少'],
      })),
      transport:{
        arrival:[{way:'双流机场',detail:'地铁 10 号线进城'}],
        local:[{way:'地铁',detail:'扫码进站'}],
        pitfall:'景区打车排队久',
        slogan:'交通一页看懂',
      },
      stay:{
        areas:[{area:'春熙路',fit:'首次到访',why:'地铁交汇'}],
        tiers:[{tier:'舒适',range:'300-500'}],
        logic:'想逛街住春熙路',
        slogan:'住哪一页看懂',
      },
      food:{
        items:[{name:'甜水面',eat:'蘸红糖辣酱',where:'洞子口'}],
        slogan:'美食一页看懂',
      },
    },
    pages,
    warnings:failed.size?['部分图片生成失败']:[],
  };
}

export function makeUgcPhotoCampaignResult(options:MakeResultOptions={}):UgcPhotoCampaignResult{
  const failed=new Set(options.failedIndexes??[]);
  const pageCount=options.pageCount??3;
  const credits=['阿紫','小蓝',''];
  return {
    requestId:options.requestId??'request-fixture',
    workflowId:'ugc-photo-campaign',
    status:failed.size?'partial':'succeeded',
    copy:{
      titles:['夏天的风','把夏天收进相册','风吹过的地方'],
      body:'整组照片的共同情绪正文。',
      tags:['#夏天','#心情图集'],
    },
    mood:'清爽明亮',
    campaignTheme:'夏日征集',
    pages:Array.from({length:pageCount},(_,index)=>({
      id:`page-${index+1}`,
      role:'poster' as const,
      filename:`ugc-poster-${index+1}.svg`,
      status:failed.has(index)?'failed' as const:'succeeded' as const,
      imageUrl:failed.has(index)?undefined:`data:image/svg+xml,fixture-${index+1}`,
      error:failed.has(index)?'图片生成服务暂时不可用':undefined,
      alt:`游客投稿海报第 ${index+1} 页`,
      photoIndex:index+1,
      ...(credits[index]?{credit:credits[index]}:{}),
    })),
    warnings:failed.size?['部分图片生成失败']:[],
  };
}

export function makeGenerateResult(options:MakeResultOptions & {workflowId?:GenerateResult['workflowId']}={}):GenerateResult{
  switch(options.workflowId){
    case 'xhs-atlas':
      return makeXhsAtlasResult(options);
    case 'travel-guide':
      return makeTravelGuideResult(options);
    case 'ugc-photo-campaign':
      return makeUgcPhotoCampaignResult(options);
    default:
      return makeOriginalIpResult(options);
  }
}

export function makeHistoryRecord(index=0,result:GenerateResult=makeOriginalIpResult()):HistoryRecord{
  const id=`request-${index}`;
  const createdAt=new Date(Date.UTC(2026,7,29,5,index)).toISOString();
  const storedFile={
    asset:{
      assetId:'asset-product',
      url:'/api/reference-assets/asset-product',
      originalName:'product.png',
      mediaType:'image/png' as const,
      size:8,
      createdAt:'2026-08-29T00:00:00.000Z',
    },
    blob:new Blob(['product'],{type:'image/png'}),
  };
  if(result.workflowId==='original-ip'){
    return {
      id,
      createdAt,
      workflowId:'original-ip',
      userPrompt:'贵州夏季避暑宣传',
      result:{...result,requestId:id},
      pageBlobs:[],
      productFile:storedFile,
    };
  }
  if(result.workflowId==='travel-guide'){
    return {
      id,
      createdAt,
      workflowId:'travel-guide',
      userPrompt:'成都',
      result:{...result,requestId:id},
      pageBlobs:[],
    };
  }
  if(result.workflowId==='ugc-photo-campaign'){
    return {
      id,
      createdAt,
      workflowId:'ugc-photo-campaign',
      userPrompt:'夏天的风',
      result:{...result,requestId:id},
      pageBlobs:[],
      photoFiles:[storedFile],
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
