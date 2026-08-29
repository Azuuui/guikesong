import {readFile} from 'node:fs/promises';
import type {
  TravelGuideDayPlan,
  TravelGuideTrip,
} from '../../../../shared/workflows';
import type {WebSearchResultItem} from '../../providers/contracts';

/**
 * 手绘攻略提示词渲染器。
 * 规则（见《生产线设计-目的地手绘旅游攻略》）：
 * 1. 生图提示词 = 风格头全文 + 页型块全文 + 脚本注入的内容槽位。
 * 2. `{{槽位}}` 由代码确定性填充，原样替换、不做任何改写；
 *    列表槽（卡片行、贴士、插画清单）由脚本按 JSON 逐条拼装成自然语句。
 * 3. 渲染结果不允许残留任何 `{{...}}` 占位符。
 */

const templateCache = new Map<string, Promise<string>>();

/** 加载提示词模板文件（带缓存，去除多余尾部空白）。 */
export function loadPromptTemplate(filename: string): Promise<string> {
  let cached = templateCache.get(filename);
  if (!cached) {
    cached = readFile(new URL(`./prompts/${filename}`, import.meta.url), 'utf8').then(
      content => content.trimEnd(),
    );
    templateCache.set(filename, cached);
  }
  return cached;
}

const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/;

/** 逐槽位替换并校验：残留任何占位符即抛错。 */
function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  const residual = rendered.match(PLACEHOLDER_PATTERN);
  if (residual) {
    throw new Error(`提示词存在未填充占位符：${residual[0]}`);
  }
  return rendered.trimEnd();
}

/** 风格头 + 页型块拼装为完整生图提示词。 */
function joinImagePrompt(styleHeader: string, pageBlock: string): string {
  return `${styleHeader}\n${pageBlock}`;
}

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

function circled(index: number): string {
  return CIRCLED_NUMBERS[index] ?? String(index + 1);
}

/* ---------- 检索资料段 ---------- */

/** 渲染提示词一的网络检索资料段；无结果时降级为一句话说明。 */
export function renderSearchContext(results: readonly WebSearchResultItem[]): string {
  if (results.length === 0) {
    return '（本次未提供检索资料，请按常识性攻略建议输出，涉及价格与时刻用"以现场为准"口吻。）';
  }
  return results.map((item, index) => `${index + 1}. ${item.title}：${item.content}`).join('\n');
}

/** 渲染提示词一（内容总成）。 */
export async function renderContentMasterPrompt(
  destination: string,
  searchContext: string,
): Promise<string> {
  const template = await loadPromptTemplate('content-master.md');
  return renderTemplate(template, {
    DEST_INPUT: destination,
    SEARCH_CONTEXT: searchContext,
  });
}

/** 渲染提示词四（发布文案）。 */
export async function renderCopyPrompt(
  destination: string,
  trip: TravelGuideTrip,
): Promise<string> {
  const template = await loadPromptTemplate('copy.md');
  return renderTemplate(template, {
    DEST_INPUT: destination,
    TRIP_JSON: JSON.stringify(trip, null, 2),
  });
}

/* ---------- 生图提示词 ---------- */

export type TravelGuideImageRole = 'cover' | 'route' | 'transport' | 'stay' | 'food';

export interface TravelGuideImagePromptPlan {
  readonly role: TravelGuideImageRole;
  /** 路线页对应第几天（1 起）；其余页型缺省。 */
  readonly day?: number;
  readonly prompt: string;
}

/** 渲染封面页型A。 */
async function renderCoverPrompt(trip: TravelGuideTrip, styleHeader: string): Promise<string> {
  const template = await loadPromptTemplate('page-cover.md');
  const block = renderTemplate(template, {
    TITLE_LINE1: trip.cover.titleLine1,
    TITLE_LINE2: trip.cover.titleLine2,
    COVER_SUBTITLE: trip.cover.subtitle,
    N_SPOT: String(trip.cover.topSpots.length),
    COVER_CARDS: trip.cover.topSpots
      .map((spot, index) => `${circled(index)}"${spot.name}"，小字"${spot.oneLiner}。"`)
      .join('\n'),
    TOC_NOTE: trip.tocNote,
  });
  return joinImagePrompt(styleHeader, block);
}

/** 渲染路线地图页型B（每天一张）。 */
async function renderRoutePrompt(
  destination: string,
  day: TravelGuideDayPlan,
  styleHeader: string,
): Promise<string> {
  const spotOf = (order: number): string => {
    const stop = day.route.find(item => item.order === order);
    return stop ? stop.spot : String(order);
  };
  const template = await loadPromptTemplate('page-route.md');
  const block = renderTemplate(template, {
    DESTINATION: destination,
    DAY: String(day.day),
    DAY_THEME: day.theme,
    K_SPOT: String(day.route.length),
    ROUTE_NOTES: day.route
      .map(stop => `${circled(stop.order - 1)}${stop.spot}：${stop.desc}`)
      .join('\n'),
    LINK_LINES: day.links
      .map(link => `${spotOf(link.from)}→${spotOf(link.to)}：${link.mode}，${link.duration}`)
      .join('\n'),
    ILLUSTRATION_LIST: day.route
      .map(stop => `${circled(stop.order - 1)}${stop.illustration}`)
      .join('\n'),
    INFO_CARDS: day.route
      .map(
        stop =>
          `${circled(stop.order - 1)}"${stop.spot}"——特点：${stop.feature}；开放时间：${stop.hours}；门票：${stop.ticket}；推荐：${stop.recommend}`,
      )
      .join('\n'),
    TIPS: day.tips.map((tip, index) => `${circled(index)}${tip}`).join('\n'),
    DAY_SLOGAN: day.slogan,
  });
  return joinImagePrompt(styleHeader, block);
}

const TRANSPORT_PAGE_VARIANT =
  '交通页可在区块之间加一幅简化城市示意图（虚线路径连接机场/高铁站与市中心，小旗子标注）。';
const STAY_PAGE_VARIANT =
  '住宿页区块一改为左侧简化城市示意图（各推荐片区用小旗子标出），右侧对应片区卡片。';

/** 渲染信息页页型C（交通页）。 */
async function renderTransportPrompt(
  destination: string,
  trip: TravelGuideTrip,
  styleHeader: string,
): Promise<string> {
  const template = await loadPromptTemplate('page-info.md');
  const block = renderTemplate(template, {
    DESTINATION: destination,
    PAGE_TOPIC: '交通',
    PAGE_SUBTITLE: '从落地到市区，一页讲明白',
    BLOCK1_TITLE: '怎么到达',
    BLOCK1_CARDS: trip.transport.arrival
      .map(item => `${item.way}——${item.detail}`)
      .join('\n'),
    BLOCK2_TITLE: '市内交通',
    BLOCK2_CARDS: trip.transport.local.map(item => `${item.way}——${item.detail}`).join('\n'),
    BLOCK_TIP_TITLE: '避坑提醒',
    TIP_CONTENT: trip.transport.pitfall,
    PAGE_SLOGAN: trip.transport.slogan,
    INFO_PAGE_VARIANT: TRANSPORT_PAGE_VARIANT,
  });
  return joinImagePrompt(styleHeader, block);
}

/** 渲染信息页页型C（住宿页）。 */
async function renderStayPrompt(
  destination: string,
  trip: TravelGuideTrip,
  styleHeader: string,
): Promise<string> {
  const template = await loadPromptTemplate('page-info.md');
  const block = renderTemplate(template, {
    DESTINATION: destination,
    PAGE_TOPIC: '住宿',
    PAGE_SUBTITLE: '选对片区，少一半奔波',
    BLOCK1_TITLE: '推荐片区',
    BLOCK1_CARDS: trip.stay.areas
      .map(area => `${area.area}（适合：${area.fit}）——${area.why}`)
      .join('\n'),
    BLOCK2_TITLE: '预算参考',
    BLOCK2_CARDS: trip.stay.tiers.map(tier => `${tier.tier}——${tier.range}`).join('\n'),
    BLOCK_TIP_TITLE: '怎么选',
    TIP_CONTENT: trip.stay.logic,
    PAGE_SLOGAN: trip.stay.slogan,
    INFO_PAGE_VARIANT: STAY_PAGE_VARIANT,
  });
  return joinImagePrompt(styleHeader, block);
}

/** 渲染清单页页型D（美食页）。 */
async function renderFoodPrompt(
  destination: string,
  trip: TravelGuideTrip,
  styleHeader: string,
): Promise<string> {
  const template = await loadPromptTemplate('page-food.md');
  const block = renderTemplate(template, {
    DESTINATION: destination,
    PAGE_SUBTITLE: `必吃${trip.food.items.length}样，照着点不踩雷`,
    N_FOOD: String(trip.food.items.length),
    FOOD_CARDS: trip.food.items
      .map(
        (item, index) => `${circled(index)}"${item.name}"——吃什么：${item.eat}；去哪吃：${item.where}`,
      )
      .join('\n'),
    FOOD_SLOGAN: trip.food.slogan,
  });
  return joinImagePrompt(styleHeader, block);
}

/**
 * 渲染全部生图提示词：封面在前，随后每天一张路线页，最后交通、住宿、美食三张专题页。
 */
export async function renderTravelGuideImagePrompts(
  destination: string,
  trip: TravelGuideTrip,
): Promise<TravelGuideImagePromptPlan[]> {
  const styleHeader = await loadPromptTemplate('style-header.md');

  const plans: TravelGuideImagePromptPlan[] = [
    {role: 'cover', prompt: await renderCoverPrompt(trip, styleHeader)},
    ...(await Promise.all(
      trip.dayPlans.map(async day => ({
        role: 'route' as const,
        day: day.day,
        prompt: await renderRoutePrompt(destination, day, styleHeader),
      })),
    )),
    {role: 'transport', prompt: await renderTransportPrompt(destination, trip, styleHeader)},
    {role: 'stay', prompt: await renderStayPrompt(destination, trip, styleHeader)},
    {role: 'food', prompt: await renderFoodPrompt(destination, trip, styleHeader)},
  ];
  return plans;
}
