import {TEMPLATE_LABELS, type TemplateId} from '../../../shared/types';

export type TemplateConfig = {
  id: TemplateId;
  name: string;
  description: string;
  previewUrl: string;
  suitableFor: string[];
  inputAdvice: string;
  referenceAdvice: string;
};

export const TEMPLATE_CONFIGS: readonly TemplateConfig[] = [
  {
    id: 'ip-image',
    name: TEMPLATE_LABELS['ip-image'],
    description: '围绕角色形象生成活动主视觉和宣传文案',
    previewUrl: '/template-previews/ip-poster.webp',
    suitableFor: ['景区 IP 宣传', '主题活动主视觉', '节庆推广'],
    inputAdvice: '说明角色特点、活动主题、目的地和希望传达的氛围。',
    referenceAdvice: '可上传角色设定、景区照片或既有活动视觉，帮助内容贴近现有形象。',
  },
  {
    id: 'travel-cards',
    name: TEMPLATE_LABELS['travel-cards'],
    description: '把景点、路线和玩法整理成多页图文内容',
    previewUrl: '/template-previews/travel-guide.webp',
    suitableFor: ['周末路线推荐', '目的地种草', '主题玩法攻略'],
    inputAdvice: '说明目的地、游玩天数、目标人群和最值得推荐的路线或体验。',
    referenceAdvice: '可上传景点、餐饮、住宿或地图截图，帮助攻略内容覆盖关键信息。',
  },
  {
    id: 'scenery-collage',
    name: TEMPLATE_LABELS['scenery-collage'],
    description: '突出自然风景、季节氛围和景点卖点',
    previewUrl: '/template-previews/scenery-visual.webp',
    suitableFor: ['景区形象传播', '季节主题推广', '自然风光宣传'],
    inputAdvice: '说明景区名称、季节、核心景观和希望呈现的光线或情绪。',
    referenceAdvice: '建议上传清晰的景区实景照片，帮助画面保留真实地貌和标志性景观。',
  },
  {
    id: 'people-collage',
    name: TEMPLATE_LABELS['people-collage'],
    description: '生成人物旅拍、打卡场景和社交传播内容',
    previewUrl: '/template-previews/people-checkin.webp',
    suitableFor: ['人物旅拍推广', '打卡点传播', '年轻客群种草'],
    inputAdvice: '说明人物类型、旅行场景、穿搭方向和希望呈现的动作或情绪。',
    referenceAdvice: '可上传人物、服装或打卡点照片，参考图仅用于辅助表达，不承诺人物一致性。',
  },
];

export const TEMPLATE_CONFIGS_BY_ID: ReadonlyMap<TemplateId, TemplateConfig> = new Map(
  TEMPLATE_CONFIGS.map(template => [template.id, template] as const),
);

export function getTemplateConfig(templateId: TemplateId): TemplateConfig {
  const template = TEMPLATE_CONFIGS_BY_ID.get(templateId);
  if (!template) throw new Error(`未找到模板配置：${templateId}`);
  return template;
}
