// @vitest-environment node
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {describe, expect, it, vi} from 'vitest';
import type {GenerationJobProgress} from '../../../../shared/generationJobs';
import type {XhsAtlasListItem, XhsAtlasRequest} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {
  GeneratedImage,
  ImageEditRequest,
  ImageGenerationRequest,
  TextJsonRequest,
} from '../../providers/contracts';
import type {WorkflowContext} from '../contracts';
import {createDefaultWorkflowRegistry} from '../registry';
import {normalizeTopic} from './normalizeTopic';
import {computeCoverLayout, paginateItems, PER_PAGE} from './pagination';
import {accentColorOf, paletteDescOf, renderAtlasContentPrompt, renderAtlasCoverPrompt} from './promptRenderer';
import {XHS_ATLAS_MOCK_FIXTURES} from './mockFixtures';
import {parseXhsAtlasCopy, parseXhsAtlasList} from './schemas';
import {createXhsAtlasWorkflow, XHS_ATLAS_IMAGE_SIZE} from './workflow';

/* ---------- 常量与夹具 ---------- */

const LIST_FIXTURE_KEY = 'xhs-atlas.list';
const COPY_FIXTURE_KEY = 'xhs-atlas.copy';

/** 提示词一输出的原始（snake_case）清单结构。 */
interface RawListFixture {
  meta: {
    user_title: string;
    count: number;
    measure_word: string;
    domain_type: string;
    org_dimension: string;
    theme_word: string;
    field_labels: [string, string];
    motif: string;
    palette: string;
    page_slogans: string[];
  };
  cover: {
    title_line1: string;
    title_line2: string;
    highlight_word: string;
    sticky_note: string;
    bottom_slogan: string;
  };
  items: Array<{
    no: string;
    tag: string;
    name: string;
    line1: string;
    line2: string;
    punch: string;
    illustration_hint: string;
  }>;
}

const RAW_LIST_FIXTURE = XHS_ATLAS_MOCK_FIXTURES.text![LIST_FIXTURE_KEY] as RawListFixture;
const RAW_COPY_FIXTURE = XHS_ATLAS_MOCK_FIXTURES.text![COPY_FIXTURE_KEY] as {
  titles: string[];
  body: string;
  tags: string[];
};

const REQUEST: XhsAtlasRequest = {
  workflowId: 'xhs-atlas',
  topic: '贵阳的12种美食',
  referenceAssetIds: [],
};

const CONTEXT: WorkflowContext = {requestId: 'req-test'};

/* ---------- 测试工具 ---------- */

function makeItems(count: number): XhsAtlasListItem[] {
  return Array.from({length: count}, (_, index) => ({
    no: String(index + 1).padStart(2, '0'),
    tag: '测试',
    name: `条目${index + 1}`,
    line1: `上榜理由${index + 1}`,
    line2: `可执行细节${index + 1}`,
    punch: `点睛信息${index + 1}`,
    illustrationHint: `插画提示${index + 1}`,
  }));
}

/** 构造合法的原始（snake_case）清单 JSON。 */
function makeRawList(count: number): RawListFixture {
  return {
    meta: {
      user_title: `贵阳的${count}种美食`,
      count,
      measure_word: '种',
      domain_type: '美食盘点',
      org_dimension: '按食用场景（早餐到宵夜）',
      theme_word: '美食',
      field_labels: ['怎么吃', '避坑'],
      motif: '一碗热气',
      palette: '美食暖橙',
      page_slogans: ['金句一', '金句二', '金句三', '金句四', '金句五', '金句六'],
    },
    cover: {
      title_line1: '贵阳的',
      title_line2: `${count}种美食`,
      highlight_word: `${count}种`,
      sticky_note: `一共${count}种，从早吃到晚`,
      bottom_slogan: '收藏这份清单，吃遍贵阳街头',
    },
    items: makeItems(count).map(item => ({
      no: item.no,
      tag: item.tag,
      name: item.name,
      line1: item.line1,
      line2: item.line2,
      punch: item.punch,
      illustration_hint: item.illustrationHint,
    })) as RawListFixture['items'],
  };
}

/** 从渲染后的提示词识别图片调用身份：封面或某页正文。 */
function imageLabelOf(prompt: string): string {
  if (prompt.includes('温暖治愈的手账涂鸦风格')) return 'cover';
  const match = prompt.match(/详解 (\d+)—(\d+)/);
  return match ? `content-${match[1]}-${match[2]}` : 'unknown';
}

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
      `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10"><rect width="8" height="10" fill="#C8102E"/></svg>`,
    );
    bytes = await sharp(svg).png().toBuffer();
    mockImageCache.set(label, bytes);
  }
  return bytes;
}

type RecordedCall =
  | {kind: 'text'; request: TextJsonRequest}
  | {kind: 'image'; request: ImageGenerationRequest | ImageEditRequest; label: string};

interface HarnessOptions {
  /** 文本 Provider 对清单请求依次返回的结果；耗尽后回落到合法夹具。 */
  listResults?: unknown[];
  copyResults?: unknown[];
  failImages?: string[];
  /** 预期并行发起的图片调用数（封面 + 正文页）；封面会等待它们全部启动。 */
  expectedImageCount?: number;
}

function createHarness(options: HarnessOptions = {}) {
  const calls: RecordedCall[] = [];
  const startedLabels: string[] = [];
  const savedImages: GeneratedImage[] = [];
  const expectedImageCount = options.expectedImageCount ?? 3;

  const text = {
    generateJson: vi.fn(async (request: TextJsonRequest) => {
      calls.push({kind: 'text', request});
      if (request.fixtureKey === LIST_FIXTURE_KEY) {
        const next = options.listResults?.shift();
        return structuredClone(next !== undefined ? next : RAW_LIST_FIXTURE);
      }
      if (request.fixtureKey === COPY_FIXTURE_KEY) {
        // 文案与全部图片并行：等首个图片调用启动后再返回
        await waitFor(() => startedLabels.length > 0);
        const next = options.copyResults?.shift();
        return structuredClone(next !== undefined ? next : RAW_COPY_FIXTURE);
      }
      throw new Error(`意外的 fixtureKey: ${request.fixtureKey}`);
    }),
  };

  const handleImage = async (
    request: ImageGenerationRequest | ImageEditRequest,
  ): Promise<GeneratedImage> => {
    const label = imageLabelOf(request.prompt);
    calls.push({kind: 'image', request, label});
    startedLabels.push(label);
    if (label === 'cover') {
      // 封面与全部正文页并行：等其余图片调用全部启动
      await waitFor(() => startedLabels.length >= expectedImageCount);
    }
    if (options.failImages?.includes(label)) {
      throw new ApiError(502, '上游图片生成失败', 'UPSTREAM_IMAGE_FAILED');
    }
    return {bytes: await mockImageFor(label), mediaType: 'image/png'};
  };

  const image = {
    generate: vi.fn((request: ImageGenerationRequest) => handleImage(request)),
    edit: vi.fn((request: ImageEditRequest) => handleImage(request)),
  };

  const deps = {
    providers: {
      text,
      vision: {
        generateJsonFromImages: vi.fn(async () => {
          throw new Error('图鉴工作流不应调用视觉 Provider');
        }),
      },
      image,
      search: {
        search: vi.fn(async () => {
          throw new Error('图鉴工作流不应调用搜索 Provider');
        }),
      },
    },
    loadReferenceImage: vi.fn(async (assetId: string) =>
      `data:image/png;base64,${Buffer.from(`ref:${assetId}`).toString('base64')}`,
    ),
    saveGeneratedImage: vi.fn(async (generated: GeneratedImage) => {
      savedImages.push(generated);
      const filename = `${randomUUID()}.png`;
      return {
        assetId: randomUUID(),
        filename,
        mediaType: generated.mediaType,
        url: `/api/generated-assets/${filename}`,
      };
    }),
  };

  const workflow = createXhsAtlasWorkflow(deps);
  return {calls, deps, workflow, text, image, savedImages};
}

/* ---------- normalizeTopic ---------- */

describe('normalizeTopic', () => {
  it('提取数字与量词，不改写正常选题', () => {
    expect(normalizeTopic('贵阳的12种美食')).toEqual({
      topic: '贵阳的12种美食',
      count: 12,
      measureWord: '种',
      warnings: [],
    });
    expect(normalizeTopic('  人生必读的36本书  ')).toEqual({
      topic: '人生必读的36本书',
      count: 36,
      measureWord: '本',
      warnings: [],
    });
    expect(normalizeTopic('越早越好的2个习惯')).toEqual({
      topic: '越早越好的2个习惯',
      count: 2,
      measureWord: '个',
      warnings: [],
    });
  });

  it('无量词时 measureWord 为空字符串', () => {
    expect(normalizeTopic('必看的12影片').measureWord).toBe('');
  });

  it('无数字或数量小于 2 时抛业务错误', () => {
    expect(() => normalizeTopic('贵阳的美食')).toThrow('选题需包含数量');
    expect(() => normalizeTopic('只有1种')).toThrow('选题数量至少为 2');
  });

  it('超过 36 时钳制为 36 并改写标题数字', () => {
    const result = normalizeTopic('贵阳的48种美食');
    expect(result.count).toBe(36);
    expect(result.topic).toBe('贵阳的36种美食');
    expect(result.measureWord).toBe('种');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('48');
    expect(result.warnings[0]).toContain('36');
  });
});

/* ---------- pagination ---------- */

describe('paginateItems', () => {
  it.each([
    [2, [2]],
    [6, [6]],
    [7, [4, 3]],
    [12, [6, 6]],
    [13, [5, 4, 4]],
    [36, [6, 6, 6, 6, 6, 6]],
  ] as const)('N=%i 均衡分页为 %j', (count, expected) => {
    expect(paginateItems(makeItems(count)).map(page => page.items.length)).toEqual(expected);
  });

  it('自定义每页条数', () => {
    expect(paginateItems(makeItems(13), 4).map(page => page.items.length)).toEqual([4, 3, 3, 3]);
    expect(PER_PAGE).toBe(6);
  });

  it('页标签随页数变化', () => {
    expect(paginateItems(makeItems(5)).map(page => page.pageLabel)).toEqual(['详解']);
    expect(paginateItems(makeItems(7)).map(page => page.pageLabel)).toEqual(['上篇', '下篇']);
    expect(paginateItems(makeItems(13)).map(page => page.pageLabel)).toEqual(['上篇', '中篇', '下篇']);
    expect(paginateItems(makeItems(24)).map(page => page.pageLabel)).toEqual([
      '第1辑',
      '第2辑',
      '第3辑',
      '第4辑',
    ]);
  });

  it('每页起止序号与条目切片一致', () => {
    const pages = paginateItems(makeItems(7));
    expect(pages[0]!.startNo).toBe('01');
    expect(pages[0]!.endNo).toBe('04');
    expect(pages[1]!.startNo).toBe('05');
    expect(pages[1]!.endNo).toBe('07');
    expect(pages[1]!.items.map(item => item.no)).toEqual(['05', '06', '07']);
  });
});

describe('computeCoverLayout', () => {
  it.each([
    [2, 2, 1],
    [3, 2, 2],
    [4, 2, 2],
    [5, 2, 3],
    [6, 3, 2],
    [9, 3, 3],
    [10, 4, 3],
    [12, 4, 3],
    [16, 4, 4],
    [20, 4, 5],
    [24, 4, 6],
    [30, 5, 6],
    [36, 6, 6],
  ] as const)('N=%i 网格为 %i 列 × %i 行', (n, cols, rows) => {
    expect(computeCoverLayout(n)).toEqual({cols, rows});
  });

  it('超出 2~36 范围抛错', () => {
    expect(() => computeCoverLayout(1)).toThrow();
    expect(() => computeCoverLayout(37)).toThrow();
  });
});

/* ---------- schemas ---------- */

describe('xhs-atlas schemas', () => {
  it('解析合法清单并映射为共享契约类型', () => {
    const list = parseXhsAtlasList(structuredClone(RAW_LIST_FIXTURE), 12);
    expect(list.meta.themeWord).toBe('美食');
    expect(list.meta.fieldLabels).toEqual(['怎么吃', '避坑']);
    expect(list.meta.pageSlogans).toHaveLength(6);
    expect(list.cover.highlightWord).toBe('12种');
    expect(list.items).toHaveLength(12);
    expect(list.items[0]).toEqual({
      no: '01',
      tag: '早餐',
      name: '肠旺面',
      line1: '一碗红油里的贵阳早晨',
      line2: '先喝汤再吃面，血旺最后拌开',
      punch: '七点前去老店不用排长队',
      illustrationHint: '一碗红油肠旺面',
    });
  });

  it('数量与选题不一致时抛业务错误', () => {
    expect(() => parseXhsAtlasList(structuredClone(RAW_LIST_FIXTURE), 13)).toThrow('数量与选题不一致');
  });

  it('字段缺失、条目名重复或序号不连续时抛业务错误', () => {
    const missing = structuredClone(RAW_LIST_FIXTURE);
    missing.items[0]!.punch = '';
    expect(() => parseXhsAtlasList(missing, 12)).toThrow('清单数据无效');

    const duplicated = structuredClone(RAW_LIST_FIXTURE);
    duplicated.items[1]!.name = '肠旺面';
    expect(() => parseXhsAtlasList(duplicated, 12)).toThrow('条目名重复');

    const unordered = structuredClone(RAW_LIST_FIXTURE);
    unordered.items[0]!.no = '05';
    expect(() => parseXhsAtlasList(unordered, 12)).toThrow('序号不连续');
  });

  it('page_slogans 不是恰好 6 条时抛业务错误', () => {
    const broken = structuredClone(RAW_LIST_FIXTURE);
    broken.meta.page_slogans.pop();
    expect(() => parseXhsAtlasList(broken, 12)).toThrow('清单数据无效');
  });

  it('解析合法与非法的发布文案', () => {
    expect(parseXhsAtlasCopy(structuredClone(RAW_COPY_FIXTURE)).titles).toHaveLength(3);
    expect(() => parseXhsAtlasCopy({titles: [], body: '', tags: []})).toThrow('文案');
  });
});

/* ---------- promptRenderer ---------- */

describe('xhs-atlas prompt renderer', () => {
  const list = parseXhsAtlasList(structuredClone(RAW_LIST_FIXTURE), 12);

  it('派生自 palette 的强调色与纸张描述', () => {
    expect(accentColorOf('美食暖橙')).toBe('暖橙色');
    expect(accentColorOf('心理蓝绿')).toBe('蓝绿色');
    expect(accentColorOf('成长草绿')).toBe('草绿色');
    expect(accentColorOf('暖橙色')).toBe('暖橙色');
    expect(paletteDescOf('美食暖橙')).toBe('美食暖橙色调');
    expect(paletteDescOf('暖橙色')).toBe('暖橙色调');
  });

  it('封面提示词填满全部槽位且无残留占位符', async () => {
    const prompt = await renderAtlasCoverPrompt(list, computeCoverLayout(12));

    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(prompt).toContain('美食暖橙色调的纸张背景带细微纸纹');
    expect(prompt).toContain('暖橙色');
    expect(prompt).toContain('一碗热气');
    expect(prompt).toContain('第一行"贵阳的"');
    expect(prompt).toContain('第二行"12种美食"');
    expect(prompt).toContain('"一共12种，从早吃到晚♥"');
    expect(prompt).toContain('4列×3行共12张');
    expect(prompt).toContain('12张卡片从左到右、从上到下依次为');
    expect(prompt).toContain('01"早餐：肠旺面"，插画是一碗红油肠旺面，底部小字"一碗红油里的贵阳早晨。"');
    expect(prompt).toContain('12"宵夜：烙锅"，插画是一口冒油的平底烙锅，底部小字"一锅烙出来的深夜社交。"');
    expect(prompt).toContain('"★ 收藏这份清单，吃遍贵阳街头 ♥"');
  });

  it('正文页提示词按分页填充页标签、起止序号与每页口号', async () => {
    const pages = paginateItems(list.items);
    const [first, second] = pages;

    const firstPrompt = await renderAtlasContentPrompt(list, first!);
    expect(firstPrompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(firstPrompt).toContain('"上篇"');
    expect(firstPrompt).toContain('"美食详解 01—06"');
    expect(firstPrompt).toContain('6个横向圆角矩形卡片');
    expect(firstPrompt).toContain('"怎么吃"');
    expect(firstPrompt).toContain('"避坑"');
    expect(firstPrompt).toContain('01"早餐：肠旺面"，插画是一碗红油肠旺面；"怎么吃"后写"先喝汤再吃面，血旺最后拌开"；"避坑"后写"七点前去老店不用排长队"。');
    expect(firstPrompt).toContain('"★ 从早餐到宵夜的口福清单 ♥"');

    const secondPrompt = await renderAtlasContentPrompt(list, second!);
    expect(secondPrompt).toContain('"下篇"');
    expect(secondPrompt).toContain('"美食详解 07—12"');
    expect(secondPrompt).toContain('07"正餐：酸汤鱼"');
    expect(secondPrompt).toContain('"★ 翻页之前先收藏 ♥"');
  });
});

/* ---------- 工作流编排 ---------- */

describe('xhs-atlas workflow', () => {
  it('按 规范化→清单→文案/封面/正文页并行 编排并返回结果', async () => {
    const harness = createHarness();
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    // 文本调用：清单在前、文案在后，均不携带任何图片数据
    const textCalls = harness.calls.filter(call => call.kind === 'text');
    expect(textCalls.map(call => call.request.fixtureKey)).toEqual([LIST_FIXTURE_KEY, COPY_FIXTURE_KEY]);
    expect(textCalls[0]!.request.prompt).toContain('【贵阳的12种美食】');
    expect(textCalls[0]!.request.prompt).not.toContain('{{USER_TITLE}}');
    expect(textCalls[1]!.request.prompt).toContain('【贵阳的12种美食】');
    expect(textCalls[1]!.request.prompt).toContain('"userTitle"');
    for (const call of textCalls) {
      expect(JSON.stringify(call.request)).not.toContain('base64');
      expect(JSON.stringify(call.request)).not.toContain('asset-');
    }

    // 图片调用：封面 + 两页正文；无参考图走文生图
    const imageCalls = harness.calls.filter(call => call.kind === 'image');
    expect(imageCalls.map(call => call.label)).toEqual([
      'cover',
      'content-01-06',
      'content-07-12',
    ]);
    expect(harness.image.generate).toHaveBeenCalledTimes(3);
    expect(harness.image.edit).not.toHaveBeenCalled();
    for (const call of imageCalls) {
      expect(call.request.prompt).not.toMatch(/\{\{[^}]+\}\}/);
      expect(call.request.size).toBe(XHS_ATLAS_IMAGE_SIZE);
    }

    // 调用顺序：清单文本最前，图片全部在其后
    expect(harness.calls[0]!.kind).toBe('text');

    // 结果：封面排第一，两页正文，全部成功
    expect(result.workflowId).toBe('xhs-atlas');
    expect(result.status).toBe('succeeded');
    expect(result.requestId).toBe('req-test');
    expect(result.topic).toBe('贵阳的12种美食');
    expect(result.list.meta.themeWord).toBe('美食');
    expect(result.copy.titles).toHaveLength(3);
    expect(result.warnings).toEqual([]);
    expect(result.pages.map(page => page.role)).toEqual(['cover', 'content', 'content']);
    expect(result.pages.map(page => page.alt)).toEqual([
      '图鉴封面',
      '美食详解 01—06',
      '美食详解 07—12',
    ]);
    for (const page of result.pages) {
      expect(page.status).toBe('succeeded');
      expect(page.imageUrl).toMatch(/^\/api\/generated-assets\/[\w-]+\.png$/);
      expect(page.filename).toMatch(/^[\w-]+\.png$/);
    }
    expect(harness.savedImages).toHaveLength(3);
  });

  it('上报公共阶段与图片计数，顺序为 preparing 到 finalizing', async () => {
    const harness = createHarness();
    const progress: GenerationJobProgress[] = [];
    const result = await harness.workflow.run(REQUEST, {
      ...CONTEXT,
      reportProgress: async event => {
        progress.push(event);
      },
    });

    expect(progress[0]).toEqual({phase: 'preparing'});
    expect(progress).toContainEqual({phase: 'content'});
    expect(progress).toContainEqual({phase: 'copy'});
    expect(progress).toContainEqual({phase: 'images', completedImages: 0, totalImages: 3});
    expect(progress).toContainEqual({phase: 'images', completedImages: 3, totalImages: 3});
    expect(progress.at(-1)).toEqual({phase: 'finalizing', completedImages: 3, totalImages: 3});

    const phaseOrder = progress.map(event => event.phase);
    expect(phaseOrder.indexOf('preparing')).toBeLessThan(phaseOrder.indexOf('content'));
    expect(phaseOrder.indexOf('content')).toBeLessThan(phaseOrder.indexOf('copy'));
    expect(phaseOrder.indexOf('copy')).toBeLessThan(phaseOrder.indexOf('images'));
    // 每张图片只推进一次计数，不会超过总数。
    const imageEvents = progress.filter(event => event.phase === 'images');
    const counts = imageEvents.map(event => event.completedImages).sort((a, b) => a! - b!);
    expect(counts).toEqual([0, 1, 2, 3]);
    expect(result.status).toBe('succeeded');
  });

  it('失败图片也计入已处理，终态计数完整', async () => {
    const harness = createHarness({failImages: ['content-01-06']});
    const progress: GenerationJobProgress[] = [];
    const result = await harness.workflow.run(REQUEST, {
      ...CONTEXT,
      reportProgress: async event => {
        progress.push(event);
      },
    });

    expect(result.status).toBe('partial');
    expect(progress.at(-1)).toEqual({phase: 'finalizing', completedImages: 3, totalImages: 3});
    const imageEvents = progress.filter(event => event.phase === 'images');
    expect(imageEvents.map(event => event.completedImages)).toContain(3);
  });

  it('参考图只进入生图调用，按语义顺序传递', async () => {
    const harness = createHarness();
    const request: XhsAtlasRequest = {
      ...REQUEST,
      referenceAssetIds: ['asset-1', 'asset-2'],
    };
    const result = await harness.workflow.run(request, CONTEXT);

    expect(harness.image.edit).toHaveBeenCalledTimes(3);
    expect(harness.image.generate).not.toHaveBeenCalled();
    const imageCalls = harness.calls.filter(call => call.kind === 'image');
    for (const call of imageCalls) {
      const urls = (call.request as ImageEditRequest).imageDataUrls;
      expect(urls).toHaveLength(2);
      expect(urls![0]).toContain(Buffer.from('ref:asset-1').toString('base64'));
      expect(urls![1]).toContain(Buffer.from('ref:asset-2').toString('base64'));
    }
    for (const call of harness.calls.filter(call => call.kind === 'text')) {
      expect(JSON.stringify(call.request)).not.toContain('base64');
      expect(JSON.stringify(call.request)).not.toContain('asset-');
    }
    expect(result.status).toBe('succeeded');
  });

  it('清单首次无效时自动重试一次', async () => {
    const harness = createHarness({listResults: [{}, structuredClone(RAW_LIST_FIXTURE)]});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('succeeded');
    expect(harness.text.generateJson).toHaveBeenCalledTimes(3);
  });

  it('清单重试后仍无效时终止且不发起文案与图片调用', async () => {
    const harness = createHarness({listResults: [{}, {}]});
    await expect(harness.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('清单');

    expect(harness.calls.map(call => call.kind)).toEqual(['text', 'text']);
    expect(harness.savedImages).toHaveLength(0);
  });

  it('文案重试后仍无效时终止整次生成', async () => {
    const harness = createHarness({copyResults: [{}, {}]});
    await expect(harness.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('文案');

    expect(harness.savedImages).toHaveLength(0);
  });

  it('单个正文页失败返回 partial，封面仍排第一且文案照常交付', async () => {
    const harness = createHarness({failImages: ['content-07-12']});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('partial');
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0]).toMatchObject({role: 'cover', status: 'succeeded'});
    expect(result.pages[1]).toMatchObject({role: 'content', status: 'succeeded'});
    expect(result.pages[2]).toMatchObject({role: 'content', status: 'failed'});
    expect(result.pages[2]!.imageUrl).toBeUndefined();
    expect(result.pages[2]!.error).toBe('上游图片生成失败');
    expect(result.copy.titles).toHaveLength(3);
  });

  it('封面失败返回 partial，正文页照常生成', async () => {
    const harness = createHarness({failImages: ['cover']});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('partial');
    expect(result.pages[0]).toMatchObject({role: 'cover', status: 'failed'});
    expect(result.pages[0]!.error).toBe('上游图片生成失败');
    expect(result.pages[1]).toMatchObject({role: 'content', status: 'succeeded'});
    expect(result.pages[2]).toMatchObject({role: 'content', status: 'succeeded'});
  });

  it('数量超限时钳制为 36 并携带改写后的选题与 warning', async () => {
    const harness = createHarness({
      listResults: [structuredClone(makeRawList(36))],
      expectedImageCount: 7,
    });
    const result = await harness.workflow.run(
      {...REQUEST, topic: '贵阳的48种美食'},
      CONTEXT,
    );

    expect(result.topic).toBe('贵阳的36种美食');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('48');
    expect(result.pages).toHaveLength(7);
    expect(result.status).toBe('succeeded');
    expect(result.pages.map(page => page.alt)).toContain('美食详解 31—36');
  });

  it('选题无数字或数量过小时直接拒绝且不触发任何模型调用', async () => {
    const harness = createHarness();
    await expect(
      harness.workflow.run({...REQUEST, topic: '贵阳的美食'}, CONTEXT),
    ).rejects.toThrow('选题需包含数量');
    await expect(
      harness.workflow.run({...REQUEST, topic: '只有1种'}, CONTEXT),
    ).rejects.toThrow('选题数量至少为 2');
    expect(harness.calls).toHaveLength(0);
  });

  it('注册进默认注册表后按 workflowId 分派', async () => {
    const harness = createHarness();
    const registry = createDefaultWorkflowRegistry({
      originalIp: {
        providers: harness.deps.providers,
        loadIpProfile: vi.fn(async () => null),
        loadIpReferenceImage: vi.fn(async () => 'data:image/png;base64,ref'),
        loadProductImage: vi.fn(async () => 'data:image/png;base64,product'),
        saveGeneratedImage: harness.deps.saveGeneratedImage,
      },
      xhsAtlas: harness.deps,
      travelGuide: {
        providers: harness.deps.providers,
        saveGeneratedImage: harness.deps.saveGeneratedImage,
      },
      ugcPhotoCampaign: {
        providers: harness.deps.providers,
        loadPhotoImage: vi.fn(async () => 'data:image/png;base64,photo'),
        saveGeneratedImage: harness.deps.saveGeneratedImage,
      },
    });

    expect(registry.list()).toEqual(['original-ip', 'xhs-atlas', 'travel-guide', 'ugc-photo-campaign']);
    expect(registry.get('xhs-atlas').id).toBe('xhs-atlas');

    const result = await registry.get('xhs-atlas').run(REQUEST, CONTEXT);
    expect(result.workflowId).toBe('xhs-atlas');
  });
});
