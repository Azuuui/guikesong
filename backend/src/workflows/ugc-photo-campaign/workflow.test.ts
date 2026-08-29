// @vitest-environment node
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {describe, expect, it, vi} from 'vitest';
import type {UgcPhotoCampaignRequest} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {
  GeneratedImage,
  ImageEditRequest,
  TextJsonRequest,
  VisionJsonRequest,
} from '../../providers/contracts';
import type {WorkflowContext} from '../contracts';
import {UGC_PHOTO_CAMPAIGN_MOCK_FIXTURES} from './mockFixtures';
import {
  loadPosterPrompt,
  renderCopyPrompt,
  renderPhotoDescriptionsPrompt,
} from './promptRenderer';
import {parsePhotoDescriptions, parseUgcPhotoCampaignCopy} from './schemas';
import {
  createUgcPhotoCampaignWorkflow,
  UGC_PHOTO_CAMPAIGN_IMAGE_SIZE,
} from './workflow';

/* ---------- 常量与夹具 ---------- */

const DESCRIPTIONS_FIXTURE_KEY = 'ugc-photo-campaign.descriptions';
const COPY_FIXTURE_KEY = 'ugc-photo-campaign.copy';

const RAW_DESCRIPTIONS_FIXTURE = UGC_PHOTO_CAMPAIGN_MOCK_FIXTURES.vision![
  DESCRIPTIONS_FIXTURE_KEY
] as {descriptions: string[]};
const RAW_COPY_FIXTURE = UGC_PHOTO_CAMPAIGN_MOCK_FIXTURES.text![COPY_FIXTURE_KEY] as {
  mood: string;
  titles: string[];
  body: string;
  tags: string[];
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

const mockImageCache = new Map<number, Buffer>();

async function mockImageFor(photoIndex: number): Promise<Buffer> {
  let bytes = mockImageCache.get(photoIndex);
  if (!bytes) {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10"><rect width="8" height="10" fill="#8FA8BF"/></svg>`,
    );
    bytes = await sharp(svg).png().toBuffer();
    mockImageCache.set(photoIndex, bytes);
  }
  return bytes;
}

function photoDataUrlOf(assetId: string): string {
  return `data:image/png;base64,${Buffer.from(`photo:${assetId}`).toString('base64')}`;
}

type RecordedCall =
  | {kind: 'vision'; request: VisionJsonRequest}
  | {kind: 'text'; request: TextJsonRequest}
  | {kind: 'image'; request: ImageEditRequest; photoIndex: number};

interface HarnessOptions {
  /** 投稿照片数（默认 3，与 Mock 夹具一致）。 */
  photoCount?: number;
  /** 视觉 Provider 对描述请求依次返回的结果；耗尽后回落到合法夹具。 */
  descriptionsResults?: unknown[];
  copyResults?: unknown[];
  /** 每次 photoIndex（1 起）都失败的海报。 */
  failPosters?: number[];
  /** 第一次失败、重跑成功的海报。 */
  failPostersOnce?: number[];
}

function createHarness(options: HarnessOptions = {}) {
  const photoCount = options.photoCount ?? 3;
  const photoAssetIds = Array.from({length: photoCount}, (_, index) => `photo-${index + 1}`);
  const photoDataUrls = photoAssetIds.map(photoDataUrlOf);
  const calls: RecordedCall[] = [];
  const startedPosters: number[] = [];
  const savedImages: GeneratedImage[] = [];
  const posterAttempts = new Map<number, number>();

  const loadPhotoImage = vi.fn(async (assetId: string) => photoDataUrlOf(assetId));

  const vision = {
    generateJsonFromImages: vi.fn(async (request: VisionJsonRequest) => {
      calls.push({kind: 'vision', request});
      const next = options.descriptionsResults?.shift();
      return structuredClone(next !== undefined ? next : RAW_DESCRIPTIONS_FIXTURE);
    }),
  };

  const text = {
    generateJson: vi.fn(async (request: TextJsonRequest) => {
      calls.push({kind: 'text', request});
      if (request.fixtureKey === COPY_FIXTURE_KEY) {
        // 文案与全部海报并行：等全部海报调用启动后再返回
        await waitFor(() => startedPosters.length >= photoCount);
        const next = options.copyResults?.shift();
        return structuredClone(next !== undefined ? next : RAW_COPY_FIXTURE);
      }
      throw new Error(`意外的 fixtureKey: ${request.fixtureKey}`);
    }),
  };

  const image = {
    generate: vi.fn(async () => {
      throw new Error('照片心情图集工作流不应调用文生图');
    }),
    edit: vi.fn(async (request: ImageEditRequest): Promise<GeneratedImage> => {
      const photoIndex = photoDataUrls.indexOf(request.imageDataUrls[0] ?? '') + 1;
      calls.push({kind: 'image', request, photoIndex});
      startedPosters.push(photoIndex);
      const attempt = (posterAttempts.get(photoIndex) ?? 0) + 1;
      posterAttempts.set(photoIndex, attempt);
      if (options.failPosters?.includes(photoIndex)) {
        throw new ApiError(502, '上游海报生成失败', 'UPSTREAM_IMAGE_FAILED');
      }
      if (options.failPostersOnce?.includes(photoIndex) && attempt === 1) {
        throw new ApiError(502, '上游海报生成失败', 'UPSTREAM_IMAGE_FAILED');
      }
      return {bytes: await mockImageFor(photoIndex), mediaType: 'image/png'};
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
    providers: {text, vision, image, search: {search: vi.fn(async () => {
      throw new Error('照片心情图集工作流不应调用搜索 Provider');
    })}},
    loadPhotoImage,
    saveGeneratedImage,
  };

  const workflow = createUgcPhotoCampaignWorkflow(deps);
  return {
    calls,
    deps,
    workflow,
    vision,
    text,
    image,
    loadPhotoImage,
    saveGeneratedImage,
    savedImages,
    photoAssetIds,
    photoDataUrls,
  };
}

/* ---------- schemas ---------- */

describe('ugc-photo-campaign schemas', () => {
  it('解析合法照片描述并按原序返回', () => {
    const descriptions = parsePhotoDescriptions(
      structuredClone(RAW_DESCRIPTIONS_FIXTURE),
      3,
    );
    expect(descriptions).toEqual([
      '清晨河面上的雾和独钓的小船',
      '夕阳下满载而归的渔船',
      '山间石桥上打伞的行人',
    ]);
  });

  it('描述数量与照片数量不一致时抛业务错误', () => {
    expect(() => parsePhotoDescriptions(structuredClone(RAW_DESCRIPTIONS_FIXTURE), 2)).toThrow(
      '照片描述数量与照片数量不一致',
    );
    expect(() => parsePhotoDescriptions({descriptions: []}, 3)).toThrow(
      '照片描述数量与照片数量不一致',
    );
  });

  it('描述结构不完整或存在空条目时抛业务错误', () => {
    expect(() => parsePhotoDescriptions({}, 3)).toThrow('照片描述数据无效');
    expect(() => parsePhotoDescriptions({descriptions: ['', '', '']}, 3)).toThrow(
      '照片描述数据无效',
    );
    expect(() => parsePhotoDescriptions({descriptions: ['a', 'b', null]}, 3)).toThrow(
      '照片描述数据无效',
    );
  });

  it('解析合法文案并拆分 mood 与 copy', () => {
    const {mood, copy} = parseUgcPhotoCampaignCopy(structuredClone(RAW_COPY_FIXTURE));
    expect(mood).toBe('安静');
    expect(copy.titles).toEqual(['起雾的时候', '世界慢下来的样子', '吹了一下午的风']);
    expect(copy.body).toContain('起雾的清晨');
    expect(copy.tags).toHaveLength(10);
  });

  it('文案字段缺失、标题数量不为 3 或数组为空时抛业务错误', () => {
    expect(() => parseUgcPhotoCampaignCopy({mood: '', titles: [], body: '', tags: []})).toThrow(
      '发布文案数据无效',
    );
    const twoTitles = structuredClone(RAW_COPY_FIXTURE);
    twoTitles.titles.pop();
    expect(() => parseUgcPhotoCampaignCopy(twoTitles)).toThrow('发布文案数据无效');
    const emptyTags = structuredClone(RAW_COPY_FIXTURE);
    emptyTags.tags = [];
    expect(() => parseUgcPhotoCampaignCopy(emptyTags)).toThrow('发布文案数据无效');
    expect(() => parseUgcPhotoCampaignCopy({mood: 'a', titles: ['x'], body: 'b'})).toThrow(
      '发布文案数据无效',
    );
  });
});

/* ---------- promptRenderer ---------- */

describe('ugc-photo-campaign prompt renderer', () => {
  it('视觉分析提示词注入照片数且无残留占位符', async () => {
    const prompt = await renderPhotoDescriptionsPrompt(3);
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(prompt).toContain('共 3 张照片');
    expect(prompt).toContain('descriptions 数组长度必须恰好为 3');
    expect(prompt).toContain('"descriptions"');
  });

  it('心情文案提示词注入照片数与编号画面描述清单', async () => {
    const prompt = await renderCopyPrompt(RAW_DESCRIPTIONS_FIXTURE.descriptions);
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(prompt).toContain('共 3 张');
    expect(prompt).toContain('1. 清晨河面上的雾和独钓的小船');
    expect(prompt).toContain('2. 夕阳下满载而归的渔船');
    expect(prompt).toContain('3. 山间石桥上打伞的行人');
    expect(prompt).toContain('"titles"');
  });

  it('海报生图提示词零改动加载且包含关键正文', async () => {
    const prompt = await loadPosterPrompt();
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(prompt).toContain('请将我上传的每一张照片分别制作成一张独立的高级设计海报');
    expect(prompt).toContain('上半部分保留原始照片');
    expect(prompt).toContain('premium minimalist flat-vector travel poster');
    expect(prompt).toContain('3:4竖版');
    expect(prompt).toContain('禁止2:3');
    expect(prompt).not.toContain('使用规则');
  });
});

/* ---------- 工作流编排 ---------- */

describe('ugc-photo-campaign workflow', () => {
  it('按 加载照片→视觉分析→文案/逐张海报并行 编排并返回结果', async () => {
    const harness = createHarness();
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    const result = await harness.workflow.run(request, CONTEXT);

    // 视觉调用一次：全部照片按上传顺序传入
    expect(harness.vision.generateJsonFromImages).toHaveBeenCalledTimes(1);
    const visionCall = harness.calls[0]!;
    expect(visionCall.kind).toBe('vision');
    if (visionCall.kind === 'vision') {
      expect(visionCall.request.imageDataUrls).toEqual(harness.photoDataUrls);
      expect(visionCall.request.fixtureKey).toBe(DESCRIPTIONS_FIXTURE_KEY);
      expect(visionCall.request.prompt).toContain('共 3 张照片');
      expect(visionCall.request.prompt).not.toMatch(/\{\{[^}]+\}\}/);
    }

    // 文案调用一次：画面描述进入提示词，照片数据绝不进入
    const textCalls = harness.calls.filter(call => call.kind === 'text');
    expect(textCalls.map(call => call.request.fixtureKey)).toEqual([COPY_FIXTURE_KEY]);
    expect(textCalls[0]!.request.prompt).toContain('1. 清晨河面上的雾和独钓的小船');
    expect(textCalls[0]!.request.prompt).toContain('共 3 张');
    expect(textCalls[0]!.request.prompt).not.toContain('base64');
    expect(textCalls[0]!.request.prompt).not.toContain('photo-1');

    // 海报调用：一照片一海报，每张独立单图
    const imageCalls = harness.calls.filter(call => call.kind === 'image');
    expect(imageCalls.map(call => call.photoIndex)).toEqual([1, 2, 3]);
    expect(harness.image.edit).toHaveBeenCalledTimes(3);
    expect(harness.image.generate).not.toHaveBeenCalled();
    for (const call of imageCalls) {
      expect(call.request.imageDataUrls).toHaveLength(1);
      expect(call.request.imageDataUrls[0]).toBe(harness.photoDataUrls[call.photoIndex - 1]);
      expect(call.request.size).toBe(UGC_PHOTO_CAMPAIGN_IMAGE_SIZE);
      expect(call.request.prompt).toContain('请将我上传的每一张照片分别制作成');
      // 生图提示词零改动：画面描述绝不进入生图调用
      expect(call.request.prompt).not.toContain('清晨河面上的雾');
    }

    // 结果：页面按上传顺序，无投稿昵称与主题时对应字段缺省
    expect(result.workflowId).toBe('ugc-photo-campaign');
    expect(result.requestId).toBe('req-test');
    expect(result.status).toBe('succeeded');
    expect(result.warnings).toEqual([]);
    expect(result.mood).toBe('安静');
    expect(result.campaignTheme).toBeUndefined();
    expect(result.copy.titles).toHaveLength(3);
    expect(result.copy.tags).toHaveLength(10);
    expect(result.pages).toHaveLength(3);
    result.pages.forEach((page, index) => {
      expect(page.role).toBe('poster');
      expect(page.photoIndex).toBe(index + 1);
      expect(page.credit).toBeUndefined();
      expect(page.alt).toBe(`第${index + 1}张投稿海报`);
      expect(page.status).toBe('succeeded');
      expect(page.imageUrl).toMatch(/^\/api\/generated-assets\/[\w-]+\.png$/);
      expect(page.filename).toMatch(/^[\w-]+\.png$/);
    });
    expect(harness.savedImages).toHaveLength(3);
    expect(harness.loadPhotoImage).toHaveBeenCalledTimes(3);
  });

  it('投稿昵称按位对齐映射到页面，空字符串视为未填写', async () => {
    const harness = createHarness();
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
      photoCredits: ['山月', '', '阿柴'],
    };
    const result = await harness.workflow.run(request, CONTEXT);

    expect(result.pages[0]!.credit).toBe('山月');
    expect(result.pages[1]!.credit).toBeUndefined();
    expect(result.pages[2]!.credit).toBe('阿柴');
    expect('credit' in result.pages[1]!).toBe(false);
    expect(result.status).toBe('succeeded');
  });

  it('活动主题有填写时原样回显', async () => {
    const harness = createHarness();
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
      campaignTheme: '我在黔东南的风里',
    };
    const result = await harness.workflow.run(request, CONTEXT);

    expect(result.campaignTheme).toBe('我在黔东南的风里');
    // 主题只回显，绝不进入文案与生图提示词
    const textCalls = harness.calls.filter(call => call.kind === 'text');
    expect(textCalls[0]!.request.prompt).not.toContain('黔东南');
    const imageCalls = harness.calls.filter(call => call.kind === 'image');
    for (const call of imageCalls) {
      expect(call.request.prompt).not.toContain('黔东南');
    }
  });

  it('单张照片也成立（单图笔记）', async () => {
    const harness = createHarness({
      photoCount: 1,
      descriptionsResults: [{descriptions: ['黄昏的码头与归航的灯']}],
    });
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    const result = await harness.workflow.run(request, CONTEXT);

    expect(result.status).toBe('succeeded');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({role: 'poster', photoIndex: 1, status: 'succeeded'});
    expect(harness.savedImages).toHaveLength(1);
  });

  it('照片描述首次无效时自动重试一次', async () => {
    const harness = createHarness({
      descriptionsResults: [{}, structuredClone(RAW_DESCRIPTIONS_FIXTURE)],
    });
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    const result = await harness.workflow.run(request, CONTEXT);

    expect(harness.vision.generateJsonFromImages).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('succeeded');
  });

  it('照片描述重试后仍无效时终止且不发起文案与海报调用', async () => {
    const harness = createHarness({descriptionsResults: [{}, {}]});
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    await expect(harness.workflow.run(request, CONTEXT)).rejects.toThrow('照片描述');

    expect(harness.vision.generateJsonFromImages).toHaveBeenCalledTimes(2);
    expect(harness.calls.filter(call => call.kind === 'text')).toHaveLength(0);
    expect(harness.calls.filter(call => call.kind === 'image')).toHaveLength(0);
    expect(harness.savedImages).toHaveLength(0);
  });

  it('文案重试后仍无效时终止整次生成且不落盘任何海报', async () => {
    const harness = createHarness({copyResults: [{}, {}]});
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    await expect(harness.workflow.run(request, CONTEXT)).rejects.toThrow('文案');

    expect(harness.savedImages).toHaveLength(0);
  });

  it('单张海报持续失败返回 partial，其余海报与文案照常交付', async () => {
    const harness = createHarness({failPosters: [2]});
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    const result = await harness.workflow.run(request, CONTEXT);

    expect(result.status).toBe('partial');
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0]).toMatchObject({role: 'poster', photoIndex: 1, status: 'succeeded'});
    expect(result.pages[1]).toMatchObject({role: 'poster', photoIndex: 2, status: 'failed'});
    expect(result.pages[1]!.imageUrl).toBeUndefined();
    expect(result.pages[1]!.filename).toBe('');
    expect(result.pages[1]!.error).toBe('上游海报生成失败');
    expect(result.pages[2]).toMatchObject({role: 'poster', photoIndex: 3, status: 'succeeded'});
    expect(result.copy.titles).toHaveLength(3);
    expect(result.mood).toBe('安静');
    expect(harness.savedImages).toHaveLength(2);
  });

  it('单张海报首次失败时自动重跑一次并恢复成功', async () => {
    const harness = createHarness({failPostersOnce: [2]});
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    const result = await harness.workflow.run(request, CONTEXT);

    // 第 2 张海报重跑一次后成功，其余各调用一次
    expect(harness.image.edit).toHaveBeenCalledTimes(4);
    const secondPosterCalls = harness.calls.filter(
      call => call.kind === 'image' && call.photoIndex === 2,
    );
    expect(secondPosterCalls).toHaveLength(2);
    expect(result.status).toBe('succeeded');
    expect(result.pages).toHaveLength(3);
    for (const page of result.pages) {
      expect(page.status).toBe('succeeded');
    }
    expect(harness.savedImages).toHaveLength(3);
  });

  it('投稿照片加载失败时整次终止', async () => {
    const harness = createHarness();
    harness.deps.loadPhotoImage.mockRejectedValueOnce(
      new ApiError(404, '投稿照片不存在', 'ASSET_NOT_FOUND'),
    );
    const request: UgcPhotoCampaignRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: harness.photoAssetIds,
    };
    await expect(harness.workflow.run(request, CONTEXT)).rejects.toThrow('投稿照片不存在');

    expect(harness.vision.generateJsonFromImages).not.toHaveBeenCalled();
    expect(harness.savedImages).toHaveLength(0);
  });
});
