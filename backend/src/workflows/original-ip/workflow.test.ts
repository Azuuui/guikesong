// @vitest-environment node
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {describe, expect, it, vi} from 'vitest';
import type {GenerationJobProgress} from '../../../../shared/generationJobs';
import type {IpProfile, OriginalIpRequest} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {
  GeneratedImage,
  ImageEditRequest,
  TextJsonRequest,
  VisionJsonRequest,
} from '../../providers/contracts';
import {createOverviewCollage} from '../../services/collage';
import type {WorkflowContext} from '../contracts';
import {createDefaultWorkflowRegistry} from '../registry';
import {parseBoardPlan, parseBrandDna, parseOriginalIpCopy} from './schemas';
import type {BoardPlan} from './schemas';
import {renderOriginalIpPrompts, renderSharedDnaBlock} from './promptRenderer';
import {ORIGINAL_IP_MOCK_FIXTURES} from './mockFixtures';
import {createOriginalIpWorkflow} from './workflow';

/* ---------- 常量与夹具 ---------- */

const BRAND_DNA_FIXTURE_KEY = 'original-ip.brand-dna';
const BOARD_PLAN_FIXTURE_KEY = 'original-ip.board-plan';
const COPY_FIXTURE_KEY = 'original-ip.copy';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const IP_IMAGE_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;
const PRODUCT_IMAGE_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

const IP_DESCRIPTION =
  '一只手绘风格的米白色玉兔，长耳耳尖为深棕色，坐姿挺拔，前爪收于胸前，眼神微抬、嘴角带一丝从容笑意。与随附 IP 形象参考图身份完全一致，不得改变其造型、比例与配色；动作与神态可按各图规划变化。';

const LOCKED_PROFILE: IpProfile = {
  ipProfileId: 'profile-1',
  version: 3,
  name: '玉兔',
  referenceImageUrl: '/api/ip-profiles/figure.png',
  description: IP_DESCRIPTION,
  status: 'locked',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const REQUEST: OriginalIpRequest = {
  workflowId: 'original-ip',
  ipProfileId: 'profile-1',
  productAssetId: 'asset-1',
  productDescription: '贵州茅台酒 200ml 小瓶装，酱香型白酒，中秋礼赠场景。',
};

const CONTEXT: WorkflowContext = {requestId: 'req-test'};

const DNA_FIXTURE = {
  品牌名: '贵州茅台',
  英文辅助名: 'KWEICHOW MOUTAI',
  slogan: '中国茅台·香飘世界',
  行业类型: '餐饮饮品',
  一句话定位: '东方酱香白酒的顶级符号，宴饮与礼赠的仪式感之选',
  目标人群: '30-55岁商务宴请、礼赠与收藏人群',
  品牌故事要点: '赤水河谷酿造，传承千年酱香工艺。',
  核心关键词: ['东方', '醇厚', '仪式感', '鎏金'],
  色彩系统: {
    主色: {hex: '#C8102E', 名称: '茅台红'},
    辅色: {hex: '#F3EEE3', 名称: '象牙白'},
    点缀色: {hex: '#C9A227', 名称: '鎏金'},
  },
  字体气质: '略带书法笔意的现代黑体',
  图形语言: '以月轮与云纹提炼的极简线条纹样',
  产品呈现方式: '单件特写',
  IP设定: {路线: '强IP', 应用方式: '礼盒主视觉、封签、吊牌挂饰、场景立牌'},
  画面质感: '高级写实商品摄影',
  主打产品: '贵州茅台酒 200ml 小瓶装',
  SKU信息: '200ml 单瓶装 / 500ml 礼盒装',
  文化元素: '中秋月宫文化，现代化为鎏金线描',
  应用方向: ['礼盒', '门店', '社媒'],
  禁止元素: ['廉价塑料感', '荧光色', '模板化国潮纹样'],
  画幅比例: '3:4',
};

const BOARD_PLAN_FIXTURE: BoardPlan = {
  boards: [
    {
      序号: 1,
      职责: '品牌主视觉封面图',
      画面主体: '金月夜幕下玉兔与茅台瓶同框望月',
      构图版式: '中轴对称构图，品牌名位于上方',
      出现物料: ['茅台瓶', '礼盒'],
      画面文字: [
        {文案: '贵州茅台', 位置: '上方居中'},
        {文案: 'KWEICHOW MOUTAI', 位置: '上方居中下方'},
      ],
      场景与氛围: '深蓝夜幕、鎏金月光、中秋气质',
      记忆点: '玉兔望月与茅台瓶同框',
      IP动态: '端坐月前仰头望月，中景',
    },
    {
      序号: 2,
      职责: '品牌识别与IP系统图',
      画面主体: '品牌识别提案板',
      构图版式: '三栏提案板排布',
      出现物料: ['字标样张', '三色色条', '玉兔徽章'],
      画面文字: [{文案: '贵州茅台', 位置: '左上角'}],
      场景与氛围: '象牙白底、克制留白',
      记忆点: '三色系统与玉兔标准姿态',
      IP动态: '标准坐姿正视图',
      模块规划: '左：品牌字标；中：三色条与字体样张；右：玉兔标准姿态与徽章应用',
    },
    {
      序号: 3,
      职责: '商品与包装系统图',
      画面主体: '玉兔主题礼盒陈列',
      构图版式: '主体居中、延展物料环绕',
      出现物料: ['礼盒', '手提袋', '封签', '吊牌'],
      画面文字: [{文案: '茅台礼盒', 位置: '包装正面'}],
      场景与氛围: '影棚布光、真实材质',
      记忆点: '礼盒盖面鎏金线描玉兔',
      IP动态: '礼盒盖面鎏金线描静态印花',
      主物料: '玉兔主题礼盒',
      延展物料: ['手提袋', '封签', '吊牌'],
    },
    {
      序号: 4,
      职责: '传播与销售场景应用图',
      画面主体: '商场中庭月洞门快闪装置',
      构图版式: '纵深构图，装置居中',
      出现物料: ['月洞门装置', '立牌', '海报'],
      画面文字: [{文案: '中国茅台·香飘世界', 位置: '月洞门上方'}],
      场景与氛围: '暖光人流、中秋前夕',
      记忆点: '月洞门下的玉兔雕塑',
      IP动态: '近人高立体雕塑，立于月洞门旁仰头望月',
      场景选择: '商场中庭月洞门中秋快闪装置',
    },
  ],
};

const COPY_FIXTURE = {
  title: '玉兔望月，茅台中秋',
  body: '赤水河畔的酱香，配上玉兔望月的东方仪式感。',
  tags: ['中秋礼赠', '酱香白酒'],
};

/* ---------- 测试工具 ---------- */

type RecordedCall =
  | {kind: 'vision'; request: VisionJsonRequest}
  | {kind: 'text'; request: TextJsonRequest}
  | {kind: 'image'; request: ImageEditRequest; label: string};

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
    const colors: Record<string, string> = {
      'C-1': '#C8102E',
      'C-2': '#F3EEE3',
      'C-3': '#C9A227',
      'C-4': '#0F766E',
    };
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10"><rect width="8" height="10" fill="${colors[label] ?? '#999999'}"/></svg>`,
    );
    bytes = await sharp(svg).png().toBuffer();
    mockImageCache.set(label, bytes);
  }
  return bytes;
}

function boardLabelOf(prompt: string): string {
  const match = prompt.match(/第 (\d) 张/);
  return match ? `C-${match[1]}` : 'unknown';
}

interface HarnessOptions {
  profile?: IpProfile | null;
  /** 视觉 Provider 依次返回的结果；耗尽后回落到合法 DNA 夹具。 */
  visionResults?: unknown[];
  failImages?: string[];
  collageImpl?: (images: readonly GeneratedImage[]) => Promise<GeneratedImage>;
}

function createHarness(options: HarnessOptions = {}) {
  const calls: RecordedCall[] = [];
  const editLabels: string[] = [];
  const savedImages: GeneratedImage[] = [];
  let copyStarted = false;

  const vision = {
    generateJsonFromImages: vi.fn(async (request: VisionJsonRequest) => {
      calls.push({kind: 'vision', request});
      return options.visionResults?.shift() ?? structuredClone(DNA_FIXTURE);
    }),
  };

  const text = {
    generateJson: vi.fn(async (request: TextJsonRequest) => {
      calls.push({kind: 'text', request});
      if (request.fixtureKey === BOARD_PLAN_FIXTURE_KEY) {
        await waitFor(() => copyStarted);
        return structuredClone(BOARD_PLAN_FIXTURE);
      }
      if (request.fixtureKey === COPY_FIXTURE_KEY) {
        copyStarted = true;
        return structuredClone(COPY_FIXTURE);
      }
      throw new Error(`意外的 fixtureKey: ${request.fixtureKey}`);
    }),
  };

  const image = {
    generate: vi.fn(async (): Promise<GeneratedImage> => {
      throw new Error('原创 IP 工作流不应调用文生图');
    }),
    edit: vi.fn(async (request: ImageEditRequest): Promise<GeneratedImage> => {
      const label = boardLabelOf(request.prompt);
      calls.push({kind: 'image', request, label});
      editLabels.push(label);
      if (label === 'C-2') {
        await waitFor(() => editLabels.includes('C-3') && editLabels.includes('C-4'));
      }
      if (options.failImages?.includes(label)) {
        throw new ApiError(502, '上游图片生成失败', 'UPSTREAM_IMAGE_FAILED');
      }
      return {bytes: await mockImageFor(label), mediaType: 'image/png'};
    }),
  };

  const deps = {
    providers: {
      text,
      vision,
      image,
      search: {
        search: vi.fn(async () => {
          throw new Error('原创 IP 工作流不应调用搜索 Provider');
        }),
      },
    },
    loadIpProfile: vi.fn(async () =>
      options.profile === undefined ? LOCKED_PROFILE : options.profile,
    ),
    loadIpReferenceImage: vi.fn(async () => IP_IMAGE_DATA_URL),
    loadProductImage: vi.fn(async () => PRODUCT_IMAGE_DATA_URL),
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
    createOverviewCollage: vi.fn(
      options.collageImpl ??
        (async (images: readonly GeneratedImage[]) =>
          ({bytes: Buffer.from(`collage:${images.length}`), mediaType: 'image/png'}) as GeneratedImage),
    ),
  };

  const workflow = createOriginalIpWorkflow(deps);
  return {calls, deps, workflow, vision, image, savedImages, editLabels};
}

/* ---------- 渲染器 ---------- */

describe('original-ip prompt renderer', () => {
  it('四条提示词共享逐字一致的 C-0 块且无残留占位符', async () => {
    const prompts = await renderOriginalIpPrompts(DNA_FIXTURE, BOARD_PLAN_FIXTURE, IP_DESCRIPTION);

    expect(prompts).toHaveLength(4);
    const block = await renderSharedDnaBlock(DNA_FIXTURE, IP_DESCRIPTION);
    for (const prompt of prompts) {
      expect(prompt.startsWith(block)).toBe(true);
      expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    }

    expect(block).toContain('品牌：贵州茅台（英文辅助名：KWEICHOW MOUTAI）｜Slogan：中国茅台·香飘世界');
    expect(block).toContain('品牌气质关键词：东方、醇厚、仪式感、鎏金');
    expect(block).toContain('主色 #C8102E（茅台红）、辅色 #F3EEE3（象牙白）、点缀色 #C9A227（鎏金）');
    expect(block).toContain(`，${IP_DESCRIPTION}。`);
    expect(block).toContain('禁止出现：廉价塑料感、荧光色、模板化国潮纹样');
    expect(block).toContain('画幅比例：3:4，竖版');
  });

  it('C-1 提示词填充画面规划与画面文字清单', async () => {
    const [c1] = await renderOriginalIpPrompts(DNA_FIXTURE, BOARD_PLAN_FIXTURE, IP_DESCRIPTION);

    expect(c1).toContain('【本图职责】这是整套品牌提案的第 1 张：品牌主视觉封面图');
    expect(c1).toContain('主体：金月夜幕下玉兔与茅台瓶同框望月');
    expect(c1).toContain('画面中出现的物料：茅台瓶、礼盒');
    expect(c1).toContain('IP 动态（若本图出现 IP）：端坐月前仰头望月，中景');
    expect(c1).toContain('贵州茅台（位置：上方居中）');
    expect(c1).toContain('KWEICHOW MOUTAI（位置：上方居中下方）');
    expect(c1).toContain('场景与氛围：深蓝夜幕、鎏金月光、中秋气质');
    expect(c1).toContain('信息克制，突出第一眼记忆点：玉兔望月与茅台瓶同框');
  });

  it('C-2/C-4 填充各自专属字段', async () => {
    const prompts = await renderOriginalIpPrompts(DNA_FIXTURE, BOARD_PLAN_FIXTURE, IP_DESCRIPTION);

    expect(prompts[1]).toContain('左：品牌字标；中：三色条与字体样张；右：玉兔标准姿态与徽章应用');
    expect(prompts[1]).toContain('IP 形象及其应用形态（礼盒主视觉、封签、吊牌挂饰、场景立牌）');
    expect(prompts[3]).toContain('场景：商场中庭月洞门中秋快闪装置');
    expect(prompts[3]).toContain('氛围：暖光人流、中秋前夕');
  });

  it('SKU 为空时删除整行，其余行保留', async () => {
    const prompts = await renderOriginalIpPrompts(
      {...DNA_FIXTURE, SKU信息: ''},
      BOARD_PLAN_FIXTURE,
      IP_DESCRIPTION,
    );

    expect(prompts[2]).not.toContain('SKU');
    expect(prompts[2]).toContain('主体物料（画面主角）：玉兔主题礼盒');
    expect(prompts[2]).toContain('延展物料（主次分明地陪衬）：手提袋、封签、吊牌');
    expect(prompts[2]).not.toMatch(/\{\{[^}]+\}\}/);
  });
});

/* ---------- Schema ---------- */

describe('original-ip schemas', () => {
  it('解析合法的品牌 DNA、四图规划与发布文案', () => {
    expect(parseBrandDna(structuredClone(DNA_FIXTURE)).品牌名).toBe('贵州茅台');
    expect(parseBoardPlan(structuredClone(BOARD_PLAN_FIXTURE)).boards).toHaveLength(4);
    expect(parseOriginalIpCopy(structuredClone(COPY_FIXTURE)).tags).toEqual(['中秋礼赠', '酱香白酒']);
  });

  it('缺失字段或四图数量不符时抛出业务错误', () => {
    expect(() => parseBrandDna({...DNA_FIXTURE, 主打产品: ''})).toThrow('品牌 DNA');
    expect(() => parseBrandDna({...DNA_FIXTURE, 核心关键词: []})).toThrow('品牌 DNA');
    expect(() => parseBoardPlan({boards: BOARD_PLAN_FIXTURE.boards.slice(0, 3)})).toThrow('画面规划');
    expect(() => parseBoardPlan({boards: [...BOARD_PLAN_FIXTURE.boards.slice(1), BOARD_PLAN_FIXTURE.boards[0]]})).toThrow(
      '画面规划',
    );
    expect(() => parseOriginalIpCopy({title: '', body: '正文', tags: ['标签']})).toThrow('文案');
  });

  it('Mock 预置数据可通过 Schema 校验并用于渲染', async () => {
    const dna = parseBrandDna(structuredClone(ORIGINAL_IP_MOCK_FIXTURES.vision!['original-ip.brand-dna']));
    const plan = parseBoardPlan(structuredClone(ORIGINAL_IP_MOCK_FIXTURES.text!['original-ip.board-plan']));
    parseOriginalIpCopy(structuredClone(ORIGINAL_IP_MOCK_FIXTURES.text!['original-ip.copy']));

    const prompts = await renderOriginalIpPrompts(dna, plan, IP_DESCRIPTION);
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    }
  });
});

/* ---------- 工作流编排 ---------- */

describe('original-ip workflow', () => {
  it('按 视觉→规划/文案并行→C-1→C-2/3/4 并行→总览 编排并返回结果', async () => {
    const harness = createHarness();
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    // 视觉 A：仅产品图，提示词包含产品描述
    const visionCalls = harness.calls.filter(call => call.kind === 'vision');
    expect(visionCalls).toHaveLength(1);
    expect(visionCalls[0]!.request.imageDataUrls).toEqual([PRODUCT_IMAGE_DATA_URL]);
    expect(visionCalls[0]!.request.prompt).toContain(REQUEST.productDescription);
    expect(visionCalls[0]!.request.fixtureKey).toBe(BRAND_DNA_FIXTURE_KEY);

    // 文本 B 与发布文案：提示词包含 brand_dna JSON，不携带图片
    const textCalls = harness.calls.filter(call => call.kind === 'text');
    expect(textCalls.map(call => call.request.fixtureKey).sort()).toEqual([
      BOARD_PLAN_FIXTURE_KEY,
      COPY_FIXTURE_KEY,
    ]);
    for (const call of textCalls) {
      expect(call.request.prompt).toContain('"品牌名": "贵州茅台"');
      expect(JSON.stringify(call.request)).not.toContain('base64');
    }
    const copyCall = textCalls.find(call => call.request.fixtureKey === COPY_FIXTURE_KEY);
    expect(copyCall!.request.prompt).toContain(REQUEST.productDescription);

    // 图片：C-1 参考图 [IP, 产品]；C-2/3/4 参考图 [IP, 产品, C-1 成图]
    const editCalls = harness.calls.filter(call => call.kind === 'image');
    expect(editCalls.map(call => call.label)).toEqual(['C-1', 'C-2', 'C-3', 'C-4']);
    expect(editCalls[0]!.request.imageDataUrls).toEqual([IP_IMAGE_DATA_URL, PRODUCT_IMAGE_DATA_URL]);
    const c1DataUrl = `data:image/png;base64,${(await mockImageFor('C-1')).toString('base64')}`;
    for (const call of editCalls.slice(1)) {
      expect(call.request.imageDataUrls).toEqual([
        IP_IMAGE_DATA_URL,
        PRODUCT_IMAGE_DATA_URL,
        c1DataUrl,
      ]);
    }
    for (const call of editCalls) {
      expect(call.request.prompt).not.toMatch(/\{\{[^}]+\}\}/);
    }

    // 调用顺序：视觉 → 文本 → C-1 → C-2/3/4
    const kinds = harness.calls.map(call => call.kind);
    expect(kinds.indexOf('vision')).toBe(0);
    expect(kinds.lastIndexOf('text')).toBeLessThan(kinds.indexOf('image'));

    // 结果：四张正式图 + 总览页 + 完整文案
    expect(result.workflowId).toBe('original-ip');
    expect(result.status).toBe('succeeded');
    expect(result.requestId).toBe('req-test');
    expect(result.copy).toEqual(COPY_FIXTURE);
    expect(result.ipProfileId).toBe('profile-1');
    expect(result.ipProfileVersion).toBe(LOCKED_PROFILE.version);
    expect(result.warnings).toEqual([]);
    expect(result.pages.map(page => page.role)).toEqual([
      'brand-cover',
      'identity-system',
      'product-system',
      'scene-application',
      'overview',
    ]);
    for (const page of result.pages) {
      expect(page.status).toBe('succeeded');
      expect(page.imageUrl).toMatch(/^\/api\/generated-assets\/[\w-]+\.png$/);
      expect(page.filename).toMatch(/^[\w-]+\.png$/);
    }
    expect(result.overview?.pageId).toBe(result.pages[4]!.id);
    expect(result.overview?.filename).toBe(result.pages[4]!.filename);

    // 总览拼接使用四张成图，且与其他图片走同一存储
    expect(harness.deps.createOverviewCollage).toHaveBeenCalledOnce();
    expect(harness.savedImages).toHaveLength(5);
    expect(harness.savedImages[4]!.bytes.toString()).toBe('collage:4');
  });

  it('上报公共阶段与四图计数，总览不计入生图总数', async () => {
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
    expect(progress).toContainEqual({phase: 'images', completedImages: 0, totalImages: 4});
    expect(progress.at(-1)).toEqual({phase: 'finalizing', completedImages: 4, totalImages: 4});

    const phaseOrder = progress.map(event => event.phase);
    expect(phaseOrder.indexOf('preparing')).toBeLessThan(phaseOrder.indexOf('content'));
    expect(phaseOrder.indexOf('content')).toBeLessThan(phaseOrder.indexOf('copy'));
    expect(phaseOrder.indexOf('copy')).toBeLessThan(phaseOrder.indexOf('images'));
    // C-1 → C-2/3/4：计数只增不减且最终等于 4。
    const imageEvents = progress.filter(event => event.phase === 'images');
    const counts = imageEvents.map(event => event.completedImages);
    expect(counts[0]).toBe(0);
    expect(counts.at(-1)).toBe(4);
    expect(result.status).toBe('succeeded');
  });

  it('IP 档案未锁定时拒绝且不触发任何模型调用', async () => {
    const harness = createHarness({profile: {...LOCKED_PROFILE, status: 'draft'}});
    await expect(harness.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('未锁定');
    expect(harness.calls).toHaveLength(0);
  });

  it('IP 档案不存在或与请求不一致时拒绝', async () => {
    const missing = createHarness({profile: null});
    await expect(missing.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('尚未创建');

    const stale = createHarness({profile: {...LOCKED_PROFILE, ipProfileId: 'profile-old'}});
    await expect(stale.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('IP 档案');
  });

  it('C-1 失败时整次生成失败且不发起 C-2～C-4 与总览', async () => {
    const harness = createHarness({failImages: ['C-1']});
    await expect(harness.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('上游图片生成失败');

    const editCalls = harness.calls.filter(call => call.kind === 'image');
    expect(editCalls.map(call => call.label)).toEqual(['C-1']);
    expect(harness.deps.createOverviewCollage).not.toHaveBeenCalled();
    expect(harness.savedImages).toHaveLength(0);
  });

  it('C-3 单页失败返回 partial 且保留其余图片与文案', async () => {
    const harness = createHarness({failImages: ['C-3']});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('partial');
    expect(result.pages).toHaveLength(5);
    expect(result.pages[2]).toMatchObject({role: 'product-system', status: 'failed'});
    expect(result.pages[2]!.imageUrl).toBeUndefined();
    expect(result.pages[2]!.error).toBe('上游图片生成失败');
    expect(result.pages[0]!.status).toBe('succeeded');
    expect(result.pages[1]!.status).toBe('succeeded');
    expect(result.pages[3]!.status).toBe('succeeded');
    expect(result.copy).toEqual(COPY_FIXTURE);
    expect(result.pages[4]!.role).toBe('overview');
  });

  it('总览拼接失败只追加 warning，不影响四张正式图', async () => {
    const harness = createHarness({
      collageImpl: async () => {
        throw new Error('sharp boom');
      },
    });
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('succeeded');
    expect(result.pages).toHaveLength(4);
    expect(result.pages.every(page => page.status === 'succeeded')).toBe(true);
    expect(result.overview).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('总览');
  });

  it('结构化输出无效时自动重试一次', async () => {
    const harness = createHarness({visionResults: [{}, structuredClone(DNA_FIXTURE)]});
    const result = await harness.workflow.run(REQUEST, CONTEXT);

    expect(result.status).toBe('succeeded');
    expect(harness.vision.generateJsonFromImages).toHaveBeenCalledTimes(2);
  });

  it('重试后仍无效时终止且不发起图片调用', async () => {
    const harness = createHarness({visionResults: [{}, {}]});
    await expect(harness.workflow.run(REQUEST, CONTEXT)).rejects.toThrow('品牌 DNA');
    expect(harness.calls.filter(call => call.kind === 'image')).toHaveLength(0);
  });

  it('注册进默认注册表后按 workflowId 分派', async () => {
    const harness = createHarness();
    const registry = createDefaultWorkflowRegistry({
      originalIp: harness.deps,
      xhsAtlas: {
        providers: harness.deps.providers,
        loadReferenceImage: vi.fn(async () => 'data:image/png;base64,ref'),
        saveGeneratedImage: harness.deps.saveGeneratedImage,
      },
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
    expect(registry.get('original-ip').id).toBe('original-ip');

    const result = await registry.get('original-ip').run(REQUEST, CONTEXT);
    expect(result.workflowId).toBe('original-ip');
  });
});

/* ---------- 2×2 总览图 ---------- */

async function fillPng(color: string): Promise<GeneratedImage> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="8"><rect width="6" height="8" fill="${color}"/></svg>`,
  );
  return {bytes: await sharp(svg).png().toBuffer(), mediaType: 'image/png'};
}

describe('overview collage', () => {
  it('将四张图拼接为 2×2 白底 PNG', async () => {
    const images = await Promise.all(['#C8102E', '#F3EEE3', '#C9A227', '#0F766E'].map(fillPng));
    const collage = await createOverviewCollage(images);

    const meta = await sharp(collage).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1608);
    expect(meta.height).toBe(2120);
    expect(collage.length).toBeGreaterThan(1000);
  });

  it('图片不足四张时仍输出 2×2 画布', async () => {
    const images = await Promise.all(['#C8102E', '#F3EEE3'].map(fillPng));
    const collage = await createOverviewCollage(images);

    const meta = await sharp(collage).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1608);
    expect(meta.height).toBe(2120);
  });
});
