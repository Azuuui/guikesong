import type {WorkflowId} from '../../../shared/workflows';
import ipPreviewUrl from '../assets/template-previews/original-ip-product.webp';
import atlasPreviewUrl from '../assets/template-previews/xhs-atlas.webp';
import travelGuidePreviewUrl from '../assets/template-previews/travel-guide.webp';
import ugcPreviewUrl from '../assets/template-previews/ugc-photo-campaign.webp';

export type TemplateConfig = {
  id: WorkflowId;
  name: string;
  description: string;
  /** 视觉变体标识；用于模板色彩和图片裁切规则。 */
  previewVariant: 'original-ip' | 'xhs-atlas' | 'travel-guide' | 'ugc-photo-campaign';
  previewImageUrl: string;
  suitableFor: string[];
  inputAdvice: string;
  examplePrompt: string;
  referenceAdvice: string;
  outputs: string;
};

export const TEMPLATE_CONFIGS: readonly TemplateConfig[] = [
  {
    id: 'xhs-atlas',
    name: '小红书种草图鉴',
    description: '把“贵阳的12种美食”式选题做成一整套可发布的图鉴内容：封面、正文页、3 个候选标题和带话题标签的正文，一次生成直接发。',
    previewVariant: 'xhs-atlas',
    previewImageUrl: atlasPreviewUrl,
    suitableFor: ['城市文化图鉴', '目的地种草', '主题清单整理'],
    inputAdvice: '选题需包含 2～36 的数量，例如“贵阳的12种美食”或“两个贵州景点”。',
    examplePrompt: '贵阳的12种夏日美食',
    referenceAdvice: '最多可选 4 张参考图，只影响画面视觉，不改变清单事实。',
    outputs: '图鉴封面与正文页图片、3 个候选标题、可直接发布的正文与标签、完整清单 JSON。',
  },
  {
    id: 'original-ip',
    name: '文创 IP 商品大片',
    description: '文旅 IP 形象确定后，为伴手礼、联名商品一键产出品牌主视觉、包装展示和场景应用四张商品图，省下一整组商拍。',
    previewVariant: 'original-ip',
    previewImageUrl: ipPreviewUrl,
    suitableFor: ['IP 形象商品化', '品牌联名提案', '文创产品上市'],
    inputAdvice: '先初始化并锁定 IP 档案，每次生成上传一张主打产品图，并用一句话描述产品。',
    examplePrompt: '米白陶瓷马克杯，杯身可印 IP 形象，主打文旅伴手礼场景',
    referenceAdvice: '固定使用锁定的 IP 标准图，日常生成只需上传一张清晰的产品图。',
    outputs: '四张 3:4 竖版图（品牌主视觉、识别系统、商品包装、场景应用）、可选 2×2 总览图与发布文案。',
  },
  {
    id: 'travel-guide',
    name: '目的地手绘攻略',
    description: '输入一个城市或景点，自动联网整理行程，产出封面、逐日路线图和交通住宿美食专题页，是游客收藏率最高的官方攻略形态。',
    previewVariant: 'travel-guide',
    previewImageUrl: travelGuidePreviewUrl,
    suitableFor: ['目的地种草攻略', '城市漫游路线', '旅行计划整理'],
    inputAdvice: '输入一个具体目的地（城市或景点），如“成都”或“杭州西湖”；天数与路线由系统自动规划。',
    examplePrompt: '成都',
    referenceAdvice: '无需上传参考图：目的地信息由联网搜索获取，手绘视觉风格全局统一。',
    outputs: '封面 + 每日路线图 + 交通/住宿/美食专题页（4～7 张）、3 个候选标题、可发布正文与标签、完整行程 JSON。',
  },
  {
    id: 'ugc-photo-campaign',
    name: '游客返图海报',
    description: '把游客随手拍的返图变成精致的情绪海报组，一图一海报并配上共同情绪文案，适合 UGC 征集活动的二次传播。',
    previewVariant: 'ugc-photo-campaign',
    previewImageUrl: ugcPreviewUrl,
    suitableFor: ['游客返图精选', '景区日常批量出图', '心情随笔笔记'],
    inputAdvice: '上传 1～7 张照片，顺序即发布顺序；可补充活动主题与逐张投稿昵称。',
    examplePrompt: '夏天的风',
    referenceAdvice: '投稿照片即素材本体，最多 7 张；单张失败自动重跑一次，不影响其他照片。',
    outputs: '一图一海报（3:4 竖版，最多 7 张）、整组情绪关键词、3 个候选标题、心情正文与标签。',
  },
];

export const TEMPLATE_CONFIGS_BY_ID: ReadonlyMap<WorkflowId, TemplateConfig> = new Map(
  TEMPLATE_CONFIGS.map(template => [template.id, template] as const),
);

export function getTemplateConfig(workflowId: WorkflowId): TemplateConfig {
  const template = TEMPLATE_CONFIGS_BY_ID.get(workflowId);
  if (!template) throw new Error(`未找到模板配置：${workflowId}`);
  return template;
}
