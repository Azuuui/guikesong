// @vitest-environment node
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {describe, expect, it, vi} from 'vitest';
import type {TravelGuideRequest} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {
  GeneratedImage,
  ImageGenerationRequest,
  TextJsonRequest,
  WebSearchOutcome,
  WebSearchRequest,
} from '../../providers/contracts';
import type {WorkflowContext} from '../contracts';
import {TRAVEL_GUIDE_MOCK_FIXTURES} from './mockFixtures';
import {
  renderContentMasterPrompt,
  renderCopyPrompt,
  renderSearchContext,
  renderTravelGuideImagePrompts,
} from './promptRenderer';
import {parseTravelGuideCopy, parseTravelGuideTrip} from './schemas';
import {
  createTravelGuideWorkflow,
  TRAVEL_GUIDE_IMAGE_SIZE,
  TRAVEL_GUIDE_SEARCH_COUNT,
} from './workflow';

/* ---------- 常量与夹具 ---------- */

const TRIP_FIXTURE_KEY = 'travel-guide.trip';
const COPY_FIXTURE_KEY = 'travel-guide.copy';
const SEARCH_FIXTURE_KEY = 'travel-guide.search';

/** 提示词一输出的原始（snake_case）行程结构。 */
interface RawTripFixture {
  trip: {destination: string; days: number; vibe: string; toc_note: string};
  cover: {
    title_line1: string;
    title_line2: string;
    subtitle: string;
    top_spots: Array<{name: string; one_liner: string}>;
  };
  days: Array<{
    day: number;
    theme: string;
    slogan: string;
    route: Array<{
      order: number;
      spot: string;
      desc: string;
      illustration: string;
      feature: string;
      hours: string;
      ticket: string;
      recommend: string;
    }>;
    links: Array<{from: number; to: number; mode: string; duration: string}>;
    tips: string[];
  }>;
  transport: {
    arrival: Array<{way: string; detail: string}>;
    local: Array<{way: string; detail: string}>;
    pitfall: string;
    slogan: string;
  };
  stay: {
    areas: Array<{area: string; fit: string; why: string}>;
    tiers: Array<{tier: string; range: string}>;
    logic: string;
    slogan: string;
  };
  food: {
    items: Array<{name: string; eat: string; where: string}>;
    slogan: string;
  };
}

const RAW_TRIP_FIXTURE = TRAVEL_GUIDE_MOCK_FIXTURES.text![TRIP_FIXTURE_KEY] as RawTripFixture;
const RAW_COPY_FIXTURE = TRAVEL_GUIDE_MOCK_FIXTURES.text![COPY_FIXTURE_KEY] as {
  titles: string[];
  body: string;
  tags: string[];
};
const SEARCH_FIXTURE = TRAVEL_GUIDE_MOCK_FIXTURES.search![SEARCH_FIXTURE_KEY] as WebSearchOutcome;

const REQUEST: TravelGuideRequest = {
  workflowId: 'travel-guide',
  destination: '成都',
};

const CONTEXT: WorkflowContext = {requestId: 'req-test'};

/* ---------- 测试工具 ---------- */

async function waitFor(predicate: () => boolean, timeoutMs = 300): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('预期的并行调用未在时限内启动');
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const mockImageCache = new Map<string, Buffer>();

async function mockImageFor(label: string): Promise<Buffer> {
  let bytes = mockImageCache.get(label);
  if (!bytes) {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10"><rect width="8" height="10" fill="#D97706"/></svg>`,
    );
    bytes = await sharp(svg).png().toBuffer();
    mockImageCache.set(label, bytes);
  }
  return bytes;
}

/** 从渲染后的提示词识别图片调用身份：封面 / 第 N 天路线 / 交通 / 住宿 / 美食。 */
function imageLabelOf(prompt: string): string {
  const routeMatch = prompt.match(/大标题"([^"]+)第(\d+)天路线"/);
  if (routeMatch) return `route-day-${routeMatch[2]}`;
  if (prompt.includes('大标题分两行')) return 'cover';
  if (/大标题"([^"]*)交通"/.test(prompt)) return 'transport';
  if (/大标题"([^"]*)住宿"/.test(prompt)) return 'stay';
  if (/大标题"([^"]*)美食清单"/.test(prompt)) return 'food';
  return 'unknown';
}

type RecordedCall =
  | {kind: 'text'; request: TextJsonRequest}
  | {kind: 'image'; request: ImageGenerationRequest; label: string}
  | {kind: 'search'; request: WebSearchRequest};

interface HarnessOptions {
  /** 文本 Provider 对行程请求依次返回的结果；耗尽后回落到合法夹具。 */
  tripResults?: unknown[];
  copyResults?: unknown[];
  /** 搜索 Provider 直接抛错，验证降级路径。 */
  searchFails?: boolean;
  failImages?: string[];
  /** 预期并行发起的图片调用数（封面 + 每天路线 + 三张专题页）。 */
  expectedImageCount?: number;
}

function createHarness(options: HarnessOptions = {}) {
  const calls: RecordedCall[] = [];
  const startedLabels: string[] = [];
  const savedImages: GeneratedImage[] = [];
  const expectedImageCount = options.expectedImageCount ?? 6;

  const search = {
    search: vi.fn(async (request: WebSearchRequest): Promise<WebSearchOutcome> => {
      calls.push({kind: 'search', request});
      if (options.searchFails) {
        throw new ApiError(502, '搜索上游失败', 'SEARCH_FAILED');
      }
      return structuredClone(SEARCH_FIXTURE);
    }),
  };

  const text = {
    generateJson: vi.fn(async (request: TextJsonRequest) => {
      calls.push({kind: 'text', request});
      if (request.fixtureKey === TRIP_FIXTURE_KEY) {
        const next = options.tripResults?.shift();
        return structuredClone(next !== undefined ? next : RAW_TRIP_FIXTURE);
      }
      if (request.fixtureKey === COPY_FIXTURE_KEY) {
        // 文案与全部图片并行：等全部图片调用启动后再返回
        await waitFor(() => startedLabels.length >= expectedImageCount);
        const next = options.copyResults?.shift();
        return structuredClone(next !== undefined ? next : RAW_COPY_FIXTURE);
      }
      throw new Error(`意外的 fixtureKey: ${request.fixtureKey}`);
    }),
  };

  const image = {
    generate: vi.fn(async (request: ImageGenerationRequest): Promise<GeneratedImage> => {
      const label = imageLabelOf(request.prompt);
      calls.push({kind: 'image', request, label});
      startedLabels.push(label);
      if (options.failImages?.includes(label)) {
        throw new ApiError(502, '上游图片生成失败', 'UPSTREAM_IMAGE_FAILED');
      }
      return {bytes: await mockImageFor(label), mediaType: 'image/png'};
    }),
    edit: vi.fn(async () => {
      throw new Error('手绘攻略工作流不应调用图片编辑');
    }),
  };

  const saveGeneratedImage = vi.fn(async (generated: GeneratedImage) => {
    savedImages.push(generated);
    const filename = `${randomUUID()}.png`;
    return {
      assetId: randomUUID(),
      filename,
      mediaType: generated.mediaType,
      url: `/api/generated-assets/${filename}`,
    };
  });

  const deps = {
    providers: {
      text,
      vision: {
        generateJsonFromImages: vi.fn(async () => {
          throw new Error('手绘攻略工作流不应调用视觉 Provider');
        }),
      },
      image,
      search,
    },
    saveGeneratedImage,
  };

  const workflow = createTravelGuideWorkflow(deps);
  return {calls, deps, workflow, text, image, search, saveGeneratedImage, savedImages};
}

/* ---------- schemas ---------- */

describe('travel-guide schemas', () => {
  it('解析合法行程并映射为共享契约类型', () => {
    const {trip, warnings} = parseTravelGuideTrip(structuredClone(RAW_TRIP_FIXTURE), '成都');

    expect(warnings).toEqual([]);
    expect(trip.destination).toBe('成都');
    expect(trip.days).toBe(2);
    expect(trip.vibe).toBe('一座把慢刻进烟火里的城市');
    expect(trip.tocNote).toBe('两天一夜：古城漫游 + 熊猫与市井，照着走就行');
    expect(trip.cover.titleLine1).toBe('成都');
    expect(trip.cover.titleLine2).toBe('两天一夜漫游');
    expect(trip.cover.topSpots).toHaveLength(6);
    expect(trip.cover.topSpots[0]).toEqual({name: '宽窄巷子', oneLiner: '青砖灰瓦里的老成都生活标本'});
    expect(trip.dayPlans).toHaveLength(2);
    expect(trip.dayPlans[0]!.theme).toBe('古城漫游');
    expect(trip.dayPlans[0]!.route).toHaveLength(4);
    expect(trip.dayPlans[0]!.route[0]).toMatchObject({order: 1, spot: '人民公园', feature: '市井茶馆'});
    expect(trip.dayPlans[0]!.links[0]).toEqual({from: 1, to: 2, mode: '步行', duration: '约15min'});
    expect(trip.dayPlans[0]!.tips).toHaveLength(3);
    expect(trip.transport.arrival).toHaveLength(3);
    expect(trip.transport.local).toHaveLength(4);
    expect(trip.stay.areas).toHaveLength(3);
    expect(trip.stay.tiers).toHaveLength(3);
    expect(trip.food.items).toHaveLength(7);
  });

  it('结构不完整时抛业务错误', () => {
    expect(() => parseTravelGuideTrip({}, '成都')).toThrow('行程数据无效');
    const missing = structuredClone(RAW_TRIP_FIXTURE) as Omit<RawTripFixture, 'days'> & {
      days?: unknown;
    };
    delete missing.days;
    expect(() => parseTravelGuideTrip(missing, '成都')).toThrow('行程数据无效');
  });

  it('天数与天数数组长不一致时抛业务错误', () => {
    const broken = structuredClone(RAW_TRIP_FIXTURE);
    broken.trip.days = 3;
    expect(() => parseTravelGuideTrip(broken, '成都')).toThrow('天数与行程天数不一致');
  });

  it('天数序号、路线序号、点位重复、衔接引用非法时抛业务错误', () => {
    const unorderedDay = structuredClone(RAW_TRIP_FIXTURE);
    unorderedDay.days[1]!.day = 5;
    expect(() => parseTravelGuideTrip(unorderedDay, '成都')).toThrow('天数序号不连续');

    const unorderedRoute = structuredClone(RAW_TRIP_FIXTURE);
    unorderedRoute.days[0]!.route[0]!.order = 2;
    expect(() => parseTravelGuideTrip(unorderedRoute, '成都')).toThrow('第 1 天路线序号不连续');

    const duplicatedSpot = structuredClone(RAW_TRIP_FIXTURE);
    duplicatedSpot.days[0]!.route[1]!.spot = '人民公园';
    expect(() => parseTravelGuideTrip(duplicatedSpot, '成都')).toThrow('第 1 天景点名重复');

    const invalidLink = structuredClone(RAW_TRIP_FIXTURE);
    invalidLink.days[0]!.links[0]!.from = 9;
    expect(() => parseTravelGuideTrip(invalidLink, '成都')).toThrow('第 1 天交通衔接引用了不存在的点位');
  });

  it('封面景点与美食名重复时抛业务错误', () => {
    const duplicatedCover = structuredClone(RAW_TRIP_FIXTURE);
    duplicatedCover.cover.top_spots[1]!.name = '宽窄巷子';
    expect(() => parseTravelGuideTrip(duplicatedCover, '成都')).toThrow('封面景点名重复');

    const duplicatedFood = structuredClone(RAW_TRIP_FIXTURE);
    duplicatedFood.food.items[1]!.name = '钟水饺';
    expect(() => parseTravelGuideTrip(duplicatedFood, '成都')).toThrow('美食名重复');
  });

  it('天数超过 3 时钳制为 3 并打 warning', () => {
    const raw = structuredClone(RAW_TRIP_FIXTURE);
    const [day1, day2] = raw.days;
    const day3 = structuredClone(day1!);
    day3.day = 3;
    const day4 = structuredClone(day2!);
    day4.day = 4;
    raw.days = [day1!, day2!, day3, day4];
    raw.trip.days = 4;

    const {trip, warnings} = parseTravelGuideTrip(raw, '成都');
    expect(trip.days).toBe(3);
    expect(trip.dayPlans.map(day => day.day)).toEqual([1, 2, 3]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('4');
    expect(warnings[0]).toContain('3');
  });

  it('模型输出的目的地与输入不一致时按输入渲染并打 warning', () => {
    const {trip, warnings} = parseTravelGuideTrip(structuredClone(RAW_TRIP_FIXTURE), '蓉城');
    expect(trip.destination).toBe('蓉城');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('蓉城');
  });

  it('解析合法与非法的发布文案', () => {
    expect(parseTravelGuideCopy(structuredClone(RAW_COPY_FIXTURE)).titles).toHaveLength(3);
    expect(() => parseTravelGuideCopy({titles: [], body: '', tags: []})).toThrow('文案');
  });
});

/* ---------- promptRenderer ---------- */

describe('travel-guide prompt renderer', () => {
  const parsed = parseTravelGuideTrip(structuredClone(RAW_TRIP_FIXTURE), '成都');
  const trip = parsed.trip;

  it('renderSearchContext 无结果时降级为常识提示', () => {
    expect(renderSearchContext([])).toContain('本次未提供检索资料');
  });

  it('renderSearchContext 有结果时渲染编号清单', () => {
    const context = renderSearchContext(SEARCH_FIXTURE.results);
    expect(context).toContain('1. 成都两天一夜经典路线（2026最新）：宽窄巷子建议早上九点前入园人少');
    expect(context).toContain('2. 成都地铁直达景点盘点');
    expect(context).toContain('3. 鹤鸣茶社营业时间与人均');
  });

  it('内容总成提示词填充目的地与检索资料', async () => {
    const prompt = await renderContentMasterPrompt('成都', renderSearchContext(SEARCH_FIXTURE.results));
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(prompt).toContain('目的地：成都');
    expect(prompt).toContain('成都两天一夜经典路线');
  });

  it('文案提示词填充目的地与行程 JSON', async () => {
    const prompt = await renderCopyPrompt('成都', trip);
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(prompt).toContain('目的地：成都');
    expect(prompt).toContain('"destination"');
    expect(prompt).toContain('"dayPlans"');
  });

  it('生图提示词按 封面→每日路线→交通→住宿→美食 排布且含风格头', async () => {
    const plans = await renderTravelGuideImagePrompts('成都', trip);

    expect(plans.map(plan => plan.role)).toEqual([
      'cover',
      'route',
      'route',
      'transport',
      'stay',
      'food',
    ]);
    expect(plans.map(plan => plan.day)).toEqual([undefined, 1, 2, undefined, undefined, undefined]);
    for (const plan of plans) {
      expect(plan.prompt).not.toMatch(/\{\{[^}]+\}\}/);
      expect(plan.prompt.startsWith('竖版3:4中文手绘旅行攻略信息图')).toBe(true);
    }
  });

  it('封面页提示词填充标题、卡片网格与目录信息', async () => {
    const [cover] = await renderTravelGuideImagePrompts('成都', trip);
    expect(cover!.prompt).toContain('第一行"成都"');
    expect(cover!.prompt).toContain('第二行"两天一夜漫游"');
    expect(cover!.prompt).toContain('"一座来了就不想走的城市"');
    expect(cover!.prompt).toContain('6张卡片');
    expect(cover!.prompt).toContain('①"宽窄巷子"，小字"青砖灰瓦里的老成都生活标本。"');
    expect(cover!.prompt).toContain('⑥"东郊记忆"，小字"老厂房改的文艺聚集地。"');
    expect(cover!.prompt).toContain('"两天一夜：古城漫游 + 熊猫与市井，照着走就行"');
  });

  it('路线页提示词填充时间轴、衔接、插画、信息卡与贴士', async () => {
    const plans = await renderTravelGuideImagePrompts('成都', trip);
    const route1 = plans[1]!.prompt;

    expect(route1).toContain('"成都第1天路线"');
    expect(route1).toContain('"古城漫游"');
    expect(route1).toContain('Day 1');
    expect(route1).toContain('4个红色定位图钉');
    expect(route1).toContain('①人民公园：本地人的晨间客厅');
    expect(route1).toContain('人民公园→宽窄巷子：步行，约15min');
    expect(route1).toContain('①竹椅盖碗茶与采耳师傅');
    expect(route1).toContain('①"人民公园"——特点：市井茶馆；开放时间：以现场公告为准；门票：免费；推荐：点一杯素毛峰配钟水饺，看大爷下棋');
    expect(route1).toContain('①第一天别排太满，茶馆本身就是行程');
    expect(route1).toContain('"把一天过慢，才算来过成都"');

    const route2 = plans[2]!.prompt;
    expect(route2).toContain('"成都第2天路线"');
    expect(route2).toContain('"熊猫与市井"');
    expect(route2).toContain('Day 2');
  });

  it('交通页提示词填充到达、市内、避坑与专题变体', async () => {
    const plans = await renderTravelGuideImagePrompts('成都', trip);
    const transport = plans[3]!.prompt;

    expect(transport).toContain('"成都交通"');
    expect(transport).toContain('"从落地到市区，一页讲明白"');
    expect(transport).toContain('怎么到达');
    expect(transport).toContain('天府机场→市区——地铁18号线直达，约40分钟');
    expect(transport).toContain('市内交通');
    expect(transport).toContain('地铁——景点覆盖率高，扫码乘车最方便');
    expect(transport).toContain('避坑提醒');
    expect(transport).toContain('别在景区门口上"黑车"，用打车软件叫车更稳');
    expect(transport).toContain('"落地不慌，市内不赶"');
    expect(transport).toContain('交通页可在区块之间加一幅简化城市示意图');
  });

  it('住宿页提示词填充片区、预算与选择逻辑', async () => {
    const plans = await renderTravelGuideImagePrompts('成都', trip);
    const stay = plans[4]!.prompt;

    expect(stay).toContain('"成都住宿"');
    expect(stay).toContain('"选对片区，少一半奔波"');
    expect(stay).toContain('推荐片区');
    expect(stay).toContain('春熙路太古里（适合：首次来成都的游客）——地铁2/3号线交汇，去哪都方便，晚上下楼就是商圈');
    expect(stay).toContain('预算参考');
    expect(stay).toContain('经济——连锁酒店为主，交通便利的地段性价比高');
    expect(stay).toContain('怎么选');
    expect(stay).toContain('"住对地方，每天多睡半小时"');
    expect(stay).toContain('左侧简化城市示意图');
  });

  it('美食页提示词填充清单与收尾金句', async () => {
    const plans = await renderTravelGuideImagePrompts('成都', trip);
    const food = plans[5]!.prompt;

    expect(food).toContain('"成都美食清单"');
    expect(food).toContain('"必吃7样，照着点不踩雷"');
    expect(food).toContain('两列共7张');
    expect(food).toContain('①"钟水饺"——吃什么：红油甜辣口的窄皮水饺；去哪吃：人民公园附近的百年老字号');
    expect(food).toContain('⑦"麻辣兔头"——吃什么：麻辣入骨的追剧神器；去哪吃：双流老妈兔头各分店');
    expect(food).toContain('"辣是底线，慢是灵魂"');
  });
});

/* ---------- 工作流编排 ---------- */

describe('travel-guide workflow', () => {
  it('按 检索→行程→文案/全部页面并行 编排并返回结果', async () => {
    const harness = createHarness();
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    // 调用顺序：检索最前，随后行程文本；文案与图片并行
    expect(harness.calls[0]!.kind).toBe('search');
    expect(harness.calls[1]!.kind).toBe('text');
    const textCalls = harness.calls.filter(call => call.kind === 'text');
    expect(textCalls.map(call => call.request.fixtureKey)).toEqual([TRIP_FIXTURE_KEY, COPY_FIXTURE_KEY]);

    // 检索请求：目的地入查询、固定条数与 fixtureKey
    const searchCall = harness.calls[0]! as {kind: 'search'; request: WebSearchRequest};
    expect(searchCall.request.query).toContain('成都');
    expect(searchCall.request.count).toBe(TRAVEL_GUIDE_SEARCH_COUNT);
    expect(searchCall.request.fixtureKey).toBe(SEARCH_FIXTURE_KEY);

    // 内容总成提示词包含检索资料
    expect(textCalls[0]!.request.prompt).toContain('宽窄巷子建议早上九点前入园人少');

    // 图片调用：封面 + 两天路线 + 三张专题页
    const imageCalls = harness.calls.filter(call => call.kind === 'image');
    expect(imageCalls.map(call => call.label)).toEqual([
      'cover',
      'route-day-1',
      'route-day-2',
      'transport',
      'stay',
      'food',
    ]);
    expect(harness.image.generate).toHaveBeenCalledTimes(6);
    expect(harness.image.edit).not.toHaveBeenCalled();
    for (const call of imageCalls) {
      expect(call.request.prompt).not.toMatch(/\{\{[^}]+\}\}/);
      expect(call.request.size).toBe(TRAVEL_GUIDE_IMAGE_SIZE);
    }

    // 结果：封面在前，路线页按天，随后交通/住宿/美食
    expect(result.workflowId).toBe('travel-guide');
    expect(result.status).toBe('succeeded');
    expect(result.requestId).toBe('req-test');
    expect(result.destination).toBe('成都');
    expect(result.days).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.copy.titles).toHaveLength(3);
    expect(result.pages.map(page => page.role)).toEqual([
      'cover',
      'route',
      'route',
      'transport',
      'stay',
      'food',
    ]);
    expect(result.pages.map(page => page.alt)).toEqual([
      '攻略封面',
      '第1天路线页',
      '第2天路线页',
      '交通页',
      '住宿页',
      '美食页',
    ]);
    expect(result.pages[1]).toMatchObject({role: 'route', day: 1});
    expect(result.pages[2]).toMatchObject({role: 'route', day: 2});
    for (const page of result.pages) {
      expect(page.status).toBe('succeeded');
      expect(page.imageUrl).toMatch(/^\/api\/generated-assets\/[\w-]+\.png$/);
      expect(page.filename).toMatch(/^[\w-]+\.png$/);
    }
    expect(harness.savedImages).toHaveLength(6);
    expect(result.trip.dayPlans).toHaveLength(2);
  });

  it('检索失败时降级为常识性建议并打 warning，不阻塞生成', async () => {
    const harness = createHarness({searchFails: true});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(harness.search.search).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('succeeded');
    expect(result.pages).toHaveLength(6);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('联网检索暂不可用');

    const textCalls = harness.calls.filter(call => call.kind === 'text');
    expect(textCalls[0]!.request.prompt).toContain('本次未提供检索资料');
  });

  it('行程首次无效时自动重试一次', async () => {
    const harness = createHarness({tripResults: [{}, structuredClone(RAW_TRIP_FIXTURE)]});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('succeeded');
    expect(harness.text.generateJson).toHaveBeenCalledTimes(3);
  });

  it('行程重试后仍无效时终止且不发起文案与图片调用', async () => {
    const harness = createHarness({tripResults: [{}, {}]});
    await expect(harness.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('行程数据无效');

    expect(harness.calls.filter(call => call.kind === 'text')).toHaveLength(2);
    expect(harness.calls.filter(call => call.kind === 'image')).toHaveLength(0);
    expect(harness.savedImages).toHaveLength(0);
  });

  it('文案重试后仍无效时终止整次生成且不落盘任何图片', async () => {
    const harness = createHarness({copyResults: [{}, {}]});
    await expect(harness.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('文案');

    expect(harness.savedImages).toHaveLength(0);
  });

  it('单个页面失败返回 partial，其余页面与文案照常交付', async () => {
    const harness = createHarness({failImages: ['food']});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('partial');
    expect(result.pages).toHaveLength(6);
    expect(result.pages[0]).toMatchObject({role: 'cover', status: 'succeeded'});
    expect(result.pages[2]).toMatchObject({role: 'route', day: 2, status: 'succeeded'});
    expect(result.pages[5]).toMatchObject({role: 'food', status: 'failed'});
    expect(result.pages[5]!.imageUrl).toBeUndefined();
    expect(result.pages[5]!.filename).toBe('');
    expect(result.pages[5]!.error).toBe('上游图片生成失败');
    expect(result.copy.titles).toHaveLength(3);
    expect(harness.savedImages).toHaveLength(5);
  });

  it('天数超限时钳制为 3：路线页减为三张并携带 warning', async () => {
    const raw = structuredClone(RAW_TRIP_FIXTURE);
    const [day1, day2] = raw.days;
    const day3 = structuredClone(day1!);
    day3.day = 3;
    const day4 = structuredClone(day2!);
    day4.day = 4;
    raw.days = [day1!, day2!, day3, day4];
    raw.trip.days = 4;

    const harness = createHarness({tripResults: [raw], expectedImageCount: 7});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.days).toBe(3);
    expect(result.pages).toHaveLength(7);
    expect(result.pages.map(page => page.role)).toEqual([
      'cover',
      'route',
      'route',
      'route',
      'transport',
      'stay',
      'food',
    ]);
    expect(result.pages[3]).toMatchObject({role: 'route', day: 3});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('已按上限收敛为 3 天');
    expect(result.status).toBe('succeeded');
  });

  it('模型目的地与输入不一致时按输入渲染并打 warning', async () => {
    const harness = createHarness();
    const result = await harness.workflow.run(
      {...REQUEST, destination: '蓉城'},
      CONTEXT,
    );

    expect(result.destination).toBe('蓉城');
    expect(result.trip.destination).toBe('蓉城');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('蓉城');

    // 封面标题来自行程 JSON，不含目的地槽位；路线与三张专题页按输入渲染
    const imageCalls = harness.calls.filter(call => call.kind === 'image');
    expect(imageCalls).toHaveLength(6);
    for (const call of imageCalls) {
      if (call.label === 'cover') continue;
      expect(call.request.prompt).toContain('蓉城');
    }
  });
});
