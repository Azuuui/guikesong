import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  IpProfilePublicOutput,
  OriginalIpResult,
  ReferenceAsset,
  TravelGuideResult,
  UgcPhotoCampaignResult,
  XhsAtlasResult,
} from '../../../../shared/types';
import {getTemplateConfig} from '../../config/templates';
import {
  createIpProfile,
  generateAssets,
  getActiveIpProfile,
  lockIpProfile,
  uploadReferenceFiles,
} from '../generation/api';
import {OriginalIpCreateForm} from './original-ip/OriginalIpCreateForm';
import {TravelGuideCreateForm} from './travel-guide/TravelGuideCreateForm';
import {type WorkflowCompletion, type WorkflowFormProps} from './types';
import {UgcPhotoCampaignCreateForm} from './ugc-photo-campaign/UgcPhotoCampaignCreateForm';
import {WorkflowCreateRouter} from './WorkflowCreateRouter';
import {XhsAtlasCreateForm} from './xhs-atlas/XhsAtlasCreateForm';

vi.mock('../generation/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
  uploadReferenceFiles: vi.fn(),
  generateAssets: vi.fn(),
  getActiveIpProfile: vi.fn(),
  createIpProfile: vi.fn(),
  lockIpProfile: vi.fn(),
}));

const uploadReferenceFilesMock = vi.mocked(uploadReferenceFiles);
const generateAssetsMock = vi.mocked(generateAssets);
const getActiveIpProfileMock = vi.mocked(getActiveIpProfile);
const createIpProfileMock = vi.mocked(createIpProfile);
const lockIpProfileMock = vi.mocked(lockIpProfile);

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function imageFile(name: string): File {
  return new File([name], name, {type: 'image/png'});
}

function makeAsset(assetId: string, name: string): ReferenceAsset {
  return {
    assetId,
    url: `/api/reference-assets/${assetId}`,
    originalName: name,
    mediaType: 'image/png',
    size: 8,
    createdAt: '2026-08-29T00:00:00.000Z',
  };
}

function makeLockedProfile(): IpProfilePublicOutput {
  return {
    ipProfileId: 'profile-1',
    version: 1,
    name: '山灵君',
    referenceImageUrl: '/api/reference-assets/ip.png',
    description: '以贵州山地云雾为灵感的守护精灵',
    status: 'locked',
  };
}

function makeOriginalIpResult(): OriginalIpResult {
  return {
    requestId: 'request-ip',
    workflowId: 'original-ip',
    status: 'succeeded',
    copy: {title: '上新预告', body: '正文', tags: ['#文创']},
    ipProfileId: 'profile-1',
    ipProfileVersion: 1,
    pages: [
      {id: 'page-1', role: 'brand-cover', filename: 'cover.png', status: 'succeeded', imageUrl: '/api/generated-assets/cover.png', alt: '品牌主视觉封面图'},
      {id: 'page-2', role: 'identity-system', filename: 'identity.png', status: 'succeeded', imageUrl: '/api/generated-assets/identity.png', alt: '品牌识别与 IP 系统图'},
      {id: 'page-3', role: 'product-system', filename: 'product.png', status: 'succeeded', imageUrl: '/api/generated-assets/product.png', alt: '商品与包装系统图'},
      {id: 'page-4', role: 'scene-application', filename: 'scene.png', status: 'succeeded', imageUrl: '/api/generated-assets/scene.png', alt: '传播与销售场景应用图'},
    ],
    warnings: [],
  };
}

function makeXhsAtlasResult(): XhsAtlasResult {
  return {
    requestId: 'request-atlas',
    workflowId: 'xhs-atlas',
    status: 'succeeded',
    copy: {titles: ['标题一', '标题二', '标题三'], body: '正文', tags: ['#贵阳美食']},
    topic: '贵阳的12种美食',
    list: {
      meta: {
        userTitle: '贵阳的12种美食',
        count: 12,
        measureWord: '种',
        domainType: '美食盘点',
        orgDimension: '按食用场景',
        themeWord: '美食',
        fieldLabels: ['怎么吃', '避坑'],
        motif: '一碗热气',
        palette: '美食暖橙',
        pageSlogans: ['一', '二', '三', '四', '五', '六'],
      },
      cover: {titleLine1: '贵阳的', titleLine2: '12种美食', highlightWord: '12种', stickyNote: '一共12种', bottomSlogan: '收藏这份清单'},
      items: [
        {no: '01', tag: '早餐', name: '肠旺面', line1: '一', line2: '二', punch: '三', illustrationHint: '一碗肠旺面'},
        {no: '02', tag: '小吃', name: '丝娃娃', line1: '一', line2: '二', punch: '三', illustrationHint: '一张薄饼'},
      ],
    },
    pages: [
      {id: 'page-cover', role: 'cover', filename: 'cover.png', status: 'succeeded', imageUrl: '/api/generated-assets/atlas-cover.png', alt: '图鉴封面'},
    ],
    warnings: [],
  };
}

function makeTravelGuideResult(): TravelGuideResult {
  return {
    requestId: 'request-guide',
    workflowId: 'travel-guide',
    status: 'succeeded',
    copy: {titles: ['成都两日', '成都慢游', '成都吃玩'], body: '正文', tags: ['#成都']},
    destination: '成都',
    days: 2,
    trip: {
      destination: '成都',
      days: 2,
      vibe: '市井与松弛',
      tocNote: '目录说明',
      cover: {
        titleLine1: '成都',
        titleLine2: '两日手绘攻略',
        subtitle: '市井与松弛',
        topSpots: [{name: '人民公园', oneLiner: '喝盖碗茶'}],
      },
      dayPlans: [
        {
          day: 1,
          theme: '老城漫步',
          slogan: '从一杯盖碗茶开始',
          route: [
            {order: 1, spot: '人民公园', desc: '喝茶', illustration: '竹椅茶馆', feature: '盖碗茶', hours: '2小时', ticket: '免费', recommend: '早上'},
          ],
          links: [{from: 1, to: 1, mode: '步行', duration: '10分钟'}],
          tips: ['早去人少'],
        },
      ],
      transport: {
        arrival: [{way: '双流机场', detail: '地铁 10 号线进城'}],
        local: [{way: '地铁', detail: '扫码进站'}],
        pitfall: '景区打车排队久',
        slogan: '交通一页看懂',
      },
      stay: {
        areas: [{area: '春熙路', fit: '首次到访', why: '地铁交汇'}],
        tiers: [{tier: '舒适', range: '300-500'}],
        logic: '想逛街住春熙路',
        slogan: '住哪一页看懂',
      },
      food: {
        items: [{name: '甜水面', eat: '蘸红糖辣酱', where: '洞子口'}],
        slogan: '美食一页看懂',
      },
    },
    pages: [
      {id: 'page-cover', role: 'cover', filename: 'cover.png', status: 'succeeded', imageUrl: '/api/generated-assets/guide-cover.png', alt: '攻略封面'},
    ],
    warnings: [],
  };
}

function makeUgcPhotoCampaignResult(): UgcPhotoCampaignResult {
  return {
    requestId: 'request-ugc',
    workflowId: 'ugc-photo-campaign',
    status: 'succeeded',
    copy: {titles: ['夏天', '夏天回来了', '风吹过'], body: '正文', tags: ['#夏天']},
    mood: '清爽',
    pages: [
      {id: 'page-1', role: 'poster', filename: 'poster-1.png', status: 'succeeded', imageUrl: '/api/generated-assets/poster-1.png', alt: '第 1 张心情海报', photoIndex: 1},
    ],
    warnings: [],
  };
}

function makeFormProps(): WorkflowFormProps {
  return {
    onComplete: vi.fn(),
    saveResult: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  uploadReferenceFilesMock.mockReset().mockResolvedValue([]);
  generateAssetsMock.mockReset();
  getActiveIpProfileMock.mockReset();
  createIpProfileMock.mockReset();
  lockIpProfileMock.mockReset();
  let sequence = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:preview-${++sequence}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  if (typeof originalCreateObjectURL === 'function') {
    URL.createObjectURL = originalCreateObjectURL;
  }
  if (typeof originalRevokeObjectURL === 'function') {
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
  vi.useRealTimers();
});

describe('XhsAtlasCreateForm', () => {
  function renderAtlasForm(
    props: Partial<WorkflowFormProps> = {},
    initialTopic?: string,
    initialReferenceFiles?: File[],
  ) {
    const formProps = {...makeFormProps(), ...props};
    render(
      <XhsAtlasCreateForm
        initialReferenceFiles={initialReferenceFiles}
        initialTopic={initialTopic}
        template={getTemplateConfig('xhs-atlas')}
        {...formProps}
      />,
    );
    return formProps;
  }

  async function submitAtlas(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', {name: '开始生成'}));
  }

  it('预填初始选题', () => {
    renderAtlasForm({}, '贵阳的12种美食');

    expect(screen.getByLabelText('图鉴选题')).toHaveValue('贵阳的12种美食');
  });

  it('从历史恢复参考图并可直接提交', async () => {
    const user = userEvent.setup();
    const restoredFiles = [imageFile('restored-a.png'), imageFile('restored-b.png')];
    generateAssetsMock.mockResolvedValue(makeXhsAtlasResult());
    uploadReferenceFilesMock.mockResolvedValue(restoredFiles.map((file, index) => makeAsset(`asset-${index + 1}`, file.name)));
    const props = renderAtlasForm({}, '贵阳的12种美食', restoredFiles);

    expect(screen.getByLabelText('图鉴选题')).toHaveValue('贵阳的12种美食');
    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(2);
    expect(within(previews).getByText('restored-a.png')).toBeInTheDocument();
    expect(within(previews).getByText('restored-b.png')).toBeInTheDocument();

    await submitAtlas(user);

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(uploadReferenceFilesMock).toHaveBeenCalledWith(restoredFiles, expect.any(AbortSignal));
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: ['asset-1', 'asset-2'],
    });
  });

  it('无数字选题阻止提交并提示', async () => {
    const user = userEvent.setup();
    const props = renderAtlasForm();

    await user.type(screen.getByLabelText('图鉴选题'), '贵阳美食');
    await submitAtlas(user);

    expect(screen.getByRole('alert')).toHaveTextContent('选题需包含数量，如"贵阳的12种美食"');
    expect(generateAssetsMock).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it.each(['2', '36'])('选题数量 %s 允许提交', async (count) => {
    const user = userEvent.setup();
    const result = makeXhsAtlasResult();
    generateAssetsMock.mockResolvedValue(result);
    const props = renderAtlasForm();

    await user.type(screen.getByLabelText('图鉴选题'), `贵阳的${count}种美食`);
    await submitAtlas(user);

    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(generateAssetsMock).toHaveBeenCalledWith(
      {workflowId: 'xhs-atlas', topic: `贵阳的${count}种美食`, referenceAssetIds: []},
      expect.any(AbortSignal),
    );
    expect(uploadReferenceFilesMock).not.toHaveBeenCalled();
  });

  it('无参考图时提交 payload 只包含 workflowId、topic 与 referenceAssetIds', async () => {
    const user = userEvent.setup();
    const result = makeXhsAtlasResult();
    generateAssetsMock.mockResolvedValue(result);
    const props = renderAtlasForm();

    await user.type(screen.getByLabelText('图鉴选题'), '贵阳的12种美食');
    await submitAtlas(user);

    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(generateAssetsMock).toHaveBeenCalledTimes(1);
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: [],
    });
    expect(uploadReferenceFilesMock).not.toHaveBeenCalled();
  });

  it('第五张参考图被拒绝并提示', async () => {
    const user = userEvent.setup();
    renderAtlasForm();

    await user.upload(
      screen.getByLabelText(/选择参考图片/),
      ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'].map(imageFile),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('最多上传 4 张图片，已忽略 1 个超出数量的文件。');
    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(4);
  });

  it('四张参考图全部上传后随请求提交', async () => {
    const user = userEvent.setup();
    generateAssetsMock.mockResolvedValue(makeXhsAtlasResult());
    const files = ['a.png', 'b.png', 'c.png', 'd.png'].map(imageFile);
    uploadReferenceFilesMock.mockResolvedValue(files.map((file, index) => makeAsset(`asset-${index + 1}`, file.name)));
    const props = renderAtlasForm();

    await user.type(screen.getByLabelText('图鉴选题'), '贵阳的12种美食');
    await user.upload(screen.getByLabelText(/选择参考图片/), files);
    await submitAtlas(user);

    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(uploadReferenceFilesMock).toHaveBeenCalledWith(files, expect.any(AbortSignal));
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: ['asset-1', 'asset-2', 'asset-3', 'asset-4'],
    });
  });

  it('参考图上传失败保留本地选择供重试', async () => {
    const user = userEvent.setup();
    const files = [imageFile('a.png'), imageFile('b.png')];
    uploadReferenceFilesMock.mockRejectedValueOnce(new Error('upload failed'));
    generateAssetsMock.mockResolvedValue(makeXhsAtlasResult());
    const props = renderAtlasForm();

    await user.type(screen.getByLabelText('图鉴选题'), '贵阳的12种美食');
    await user.upload(screen.getByLabelText(/选择参考图片/), files);
    await submitAtlas(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('参考图上传失败，请稍后重试。');
    expect(props.onComplete).not.toHaveBeenCalled();
    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(2);

    uploadReferenceFilesMock.mockResolvedValue(files.map((file, index) => makeAsset(`asset-${index + 1}`, file.name)));
    await user.click(screen.getByRole('button', {name: '重新生成'}));

    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: ['asset-1', 'asset-2'],
    });
  });

  it('生成失败显示安全错误并可重试', async () => {
    const user = userEvent.setup();
    generateAssetsMock.mockRejectedValueOnce(new Error('provider exploded'));
    generateAssetsMock.mockResolvedValueOnce(makeXhsAtlasResult());
    const props = renderAtlasForm();

    await user.type(screen.getByLabelText('图鉴选题'), '贵阳的12种美食');
    await submitAtlas(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('素材生成失败，请稍后重试。');

    await user.click(screen.getByRole('button', {name: '重新生成'}));
    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
  });

  it('历史保存失败不阻断完成并携带警告', async () => {
    const user = userEvent.setup();
    generateAssetsMock.mockResolvedValue(makeXhsAtlasResult());
    const onComplete = vi.fn();
    renderAtlasForm({onComplete, saveResult: vi.fn().mockRejectedValue(new Error('idb full'))});

    await user.type(screen.getByLabelText('图鉴选题'), '贵阳的12种美食');
    await submitAtlas(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const completion = onComplete.mock.calls[0][0] as WorkflowCompletion;
    expect(completion.historySaveWarning).toBe('素材已经生成，但未能保存到本机历史。请先下载素材包。');
    expect(completion.userPrompt).toBe('贵阳的12种美食');
    expect(completion.result.requestId).toBe('request-atlas');
  });
});

describe('OriginalIpCreateForm', () => {
  function renderIpForm(
    props: Partial<WorkflowFormProps> = {},
    initialProductDescription?: string,
    initialProductFiles?: File[],
  ) {
    const formProps = {...makeFormProps(), ...props};
    render(
      <OriginalIpCreateForm
        initialProductDescription={initialProductDescription}
        initialProductFiles={initialProductFiles}
        template={getTemplateConfig('original-ip')}
        {...formProps}
      />,
    );
    return formProps;
  }

  async function fillGenerationForm(user: ReturnType<typeof userEvent.setup>, description: string) {
    await user.type(screen.getByLabelText('产品描述'), description);
    await user.upload(screen.getByLabelText(/选择产品图片/), [imageFile('cup.png')]);
  }

  it('无 IP 档案时显示初始化表单', async () => {
    getActiveIpProfileMock.mockResolvedValue(null);
    renderIpForm();

    expect(await screen.findByRole('button', {name: '保存并锁定 IP 档案'})).toBeVisible();
    expect(screen.getByLabelText(/选择 IP 形象标准图/)).toBeVisible();
  });

  it('初始化表单校验图片、名称与描述必填', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(null);
    renderIpForm();
    await screen.findByRole('button', {name: '保存并锁定 IP 档案'});

    await user.click(screen.getByRole('button', {name: '保存并锁定 IP 档案'}));
    expect(screen.getByRole('alert')).toHaveTextContent('请上传一张 IP 形象标准图');
    expect(createIpProfileMock).not.toHaveBeenCalled();

    await user.upload(screen.getByLabelText(/选择 IP 形象标准图/), [imageFile('ip.png')]);
    await user.click(screen.getByRole('button', {name: '保存并锁定 IP 档案'}));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入 IP 名称');

    await user.type(screen.getByLabelText('IP 名称'), '山灵君');
    await user.click(screen.getByRole('button', {name: '保存并锁定 IP 档案'}));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入 IP 描述');

    expect(createIpProfileMock).not.toHaveBeenCalled();
  });

  it('提交初始化后创建并锁定档案，然后进入生成表单', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(null);
    createIpProfileMock.mockResolvedValue({...makeLockedProfile(), status: 'draft'});
    lockIpProfileMock.mockResolvedValue(makeLockedProfile());
    renderIpForm();
    await screen.findByRole('button', {name: '保存并锁定 IP 档案'});

    const file = imageFile('ip.png');
    await user.upload(screen.getByLabelText(/选择 IP 形象标准图/), [file]);
    await user.type(screen.getByLabelText('IP 名称'), '山灵君');
    await user.type(screen.getByLabelText('IP 描述'), '以贵州山地云雾为灵感的守护精灵');
    await user.click(screen.getByRole('button', {name: '保存并锁定 IP 档案'}));

    expect(await screen.findByRole('heading', {name: '山灵君'})).toBeVisible();
    expect(createIpProfileMock).toHaveBeenCalledWith({
      file,
      name: '山灵君',
      description: '以贵州山地云雾为灵感的守护精灵',
    });
    expect(lockIpProfileMock).toHaveBeenCalledWith('profile-1');
    expect(screen.getByText('已锁定 IP 档案 · 版本 1')).toBeVisible();
  });

  it('草稿档案显示覆盖提示', async () => {
    getActiveIpProfileMock.mockResolvedValue({...makeLockedProfile(), status: 'draft'});
    renderIpForm();

    expect(await screen.findByText('检测到未锁定的 IP 档案')).toBeVisible();
    expect(screen.getByRole('button', {name: '保存并锁定 IP 档案'})).toBeVisible();
  });

  it('锁定档案显示只读卡片与产品表单', async () => {
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    renderIpForm();

    expect(await screen.findByRole('heading', {name: '山灵君'})).toBeVisible();
    expect(screen.getByText('已锁定 IP 档案 · 版本 1')).toBeVisible();
    expect(screen.getByText('以贵州山地云雾为灵感的守护精灵')).toBeVisible();
    expect(screen.getByLabelText('产品描述')).toBeVisible();
    expect(screen.getByLabelText(/选择产品图片/)).toBeVisible();
    expect(screen.queryByRole('button', {name: '保存并锁定 IP 档案'})).not.toBeInTheDocument();
  });

  it('档案读取失败显示错误并可重试', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockRejectedValueOnce(new Error('network down'));
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    renderIpForm();

    expect(await screen.findByText('IP 档案读取失败')).toBeVisible();
    await user.click(screen.getByRole('button', {name: '重新读取'}));

    expect(await screen.findByRole('heading', {name: '山灵君'})).toBeVisible();
    expect(getActiveIpProfileMock).toHaveBeenCalledTimes(2);
  });

  it('日常生成只允许一张产品图', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    renderIpForm();
    await screen.findByRole('heading', {name: '山灵君'});

    await user.upload(screen.getByLabelText(/选择产品图片/), [imageFile('a.png')]);
    await user.upload(screen.getByLabelText(/选择产品图片/), [imageFile('b.png')]);

    expect(screen.getByRole('alert')).toHaveTextContent('最多上传 1 张图片，已忽略 1 个超出数量的文件。');
    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(1);
  });

  it('产品图与产品描述必填', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    renderIpForm();
    await screen.findByRole('heading', {name: '山灵君'});

    await user.click(screen.getByRole('button', {name: '开始生成'}));
    expect(screen.getByRole('alert')).toHaveTextContent('请上传一张产品图');

    await user.type(screen.getByLabelText('产品描述'), '米白陶瓷杯');
    await user.click(screen.getByRole('button', {name: '开始生成'}));
    expect(screen.getByRole('alert')).toHaveTextContent('请上传一张产品图');
    expect(generateAssetsMock).not.toHaveBeenCalled();
  });

  it('完整生成流程按契约提交并保存历史', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    const result = makeOriginalIpResult();
    generateAssetsMock.mockResolvedValue(result);
    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-product', 'cup.png')]);
    const onComplete = vi.fn();
    const props = renderIpForm({onComplete}, '米白陶瓷杯');
    await screen.findByRole('heading', {name: '山灵君'});

    expect(screen.getByLabelText('产品描述')).toHaveValue('米白陶瓷杯');
    const productFile = imageFile('cup.png');
    await user.upload(screen.getByLabelText(/选择产品图片/), [productFile]);
    await user.click(screen.getByRole('button', {name: '开始生成'}));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(generateAssetsMock).toHaveBeenCalledTimes(1);
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'original-ip',
      ipProfileId: 'profile-1',
      productAssetId: 'asset-product',
      productDescription: '米白陶瓷杯',
    });
    expect(props.saveResult).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: 'original-ip',
      result,
      userPrompt: '米白陶瓷杯',
      referenceFiles: [{asset: makeAsset('asset-product', 'cup.png'), blob: productFile}],
    }));
    const completion = onComplete.mock.calls[0][0] as WorkflowCompletion;
    expect(completion).toMatchObject({requestId: 'request-ip', userPrompt: '米白陶瓷杯', result});
    expect(completion.historySaveWarning).toBeUndefined();
  });

  it('从历史恢复产品描述与产品图并可直接提交', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    const restoredFile = imageFile('restored-cup.png');
    generateAssetsMock.mockResolvedValue(makeOriginalIpResult());
    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-product', 'restored-cup.png')]);
    const props = renderIpForm({}, '米白陶瓷杯', [restoredFile]);
    await screen.findByRole('heading', {name: '山灵君'});

    expect(screen.getByLabelText('产品描述')).toHaveValue('米白陶瓷杯');
    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(1);
    expect(within(previews).getByText('restored-cup.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: '开始生成'}));

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(uploadReferenceFilesMock).toHaveBeenCalledWith([restoredFile], expect.any(AbortSignal));
  });

  it('产品图上传失败显示安全错误且可重试', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    uploadReferenceFilesMock.mockRejectedValueOnce(new Error('upload failed'));
    generateAssetsMock.mockResolvedValue(makeOriginalIpResult());
    const props = renderIpForm();
    await screen.findByRole('heading', {name: '山灵君'});

    await fillGenerationForm(user, '米白陶瓷杯');
    await user.click(screen.getByRole('button', {name: '开始生成'}));

    expect(await screen.findByRole('alert')).toHaveTextContent('产品图上传失败，请稍后重试。');
    expect(generateAssetsMock).not.toHaveBeenCalled();

    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-product', 'cup.png')]);
    await user.click(screen.getByRole('button', {name: '重新生成'}));

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
  });

  it('阶段文案按分析、规划、首图、后三图、保存推进', async () => {
    // shouldAdvanceTime：RTL 的 asyncWrapper 用真实 setTimeout(0) 排空微任务，
    // 且只在 jest 假定时器下推进时钟；让假时钟跟随真实时间推进才能避免 user.type 挂起。
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-product', 'cup.png')]);
    let resolveGenerate!: (value: OriginalIpResult) => void;
    generateAssetsMock.mockImplementation(
      () => new Promise<OriginalIpResult>(resolve => {
        resolveGenerate = resolve;
      }),
    );
    renderIpForm();
    // fake timers 下 findBy* 的轮询依赖真实计时器，改用 act 冲刷微任务后同步断言。
    await act(async () => {});
    screen.getByRole('heading', {name: '山灵君'});

    await user.type(screen.getByLabelText('产品描述'), '米白陶瓷杯');
    await user.upload(screen.getByLabelText(/选择产品图片/), [imageFile('cup.png')]);
    await user.click(screen.getByRole('button', {name: '开始生成'}));

    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('正在分析产品图与 IP 形象');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('status')).toHaveTextContent('正在规划四张画面');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('status')).toHaveTextContent('正在生成首图');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('status')).toHaveTextContent('正在生成其余三图');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('status')).toHaveTextContent('正在生成其余三图');

    await act(async () => {
      resolveGenerate(makeOriginalIpResult());
    });
    expect(screen.getByRole('status')).toHaveTextContent('正在保存到本机历史');
  });

  it('连续双击只触发一次生成请求', async () => {
    const user = userEvent.setup();
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-product', 'cup.png')]);
    let resolveGenerate!: (value: OriginalIpResult) => void;
    generateAssetsMock.mockImplementation(
      () => new Promise<OriginalIpResult>(resolve => {
        resolveGenerate = resolve;
      }),
    );
    renderIpForm();
    await screen.findByRole('heading', {name: '山灵君'});

    await user.type(screen.getByLabelText('产品描述'), '米白陶瓷杯');
    await user.upload(screen.getByLabelText(/选择产品图片/), [imageFile('cup.png')]);
    const submit = screen.getByRole('button', {name: '开始生成'});
    await user.click(submit);
    await user.click(submit);

    expect(generateAssetsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveGenerate(makeOriginalIpResult());
    });
  });
});

describe('TravelGuideCreateForm', () => {
  function renderGuideForm(
    props: Partial<WorkflowFormProps> = {},
    initialDestination?: string,
  ) {
    const formProps = {...makeFormProps(), ...props};
    render(
      <TravelGuideCreateForm
        initialDestination={initialDestination}
        template={getTemplateConfig('travel-guide')}
        {...formProps}
      />,
    );
    return formProps;
  }

  async function submitGuide(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', {name: '开始生成'}));
  }

  it('预填初始目的地', () => {
    renderGuideForm({}, '杭州西湖');

    expect(screen.getByLabelText('目的地')).toHaveValue('杭州西湖');
  });

  it('空目的地阻止提交并提示', async () => {
    const user = userEvent.setup();
    const props = renderGuideForm();

    await submitGuide(user);

    expect(screen.getByRole('alert')).toHaveTextContent('请输入目的地，如"成都"或"杭州西湖"');
    expect(generateAssetsMock).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it.each([
    ['中国', '目的地范围过大，请输入城市或景点，如"成都"或"杭州西湖"'],
    ['123', '请输入一个具体的目的地，如"成都"或"杭州西湖"'],
  ])('目的地 %s 阻止提交并提示', async (destination, message) => {
    const user = userEvent.setup();
    const props = renderGuideForm();

    await user.type(screen.getByLabelText('目的地'), destination);
    await submitGuide(user);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(generateAssetsMock).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('合法目的地按契约提交且不上传参考图', async () => {
    const user = userEvent.setup();
    generateAssetsMock.mockResolvedValue(makeTravelGuideResult());
    const props = renderGuideForm();

    await user.type(screen.getByLabelText('目的地'), '成都');
    await submitGuide(user);

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(generateAssetsMock).toHaveBeenCalledTimes(1);
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'travel-guide',
      destination: '成都',
    });
    expect(uploadReferenceFilesMock).not.toHaveBeenCalled();
    expect(props.saveResult).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: 'travel-guide',
      userPrompt: '成都',
      referenceFiles: [],
    }));
  });

  it('生成失败显示安全错误并可重试', async () => {
    const user = userEvent.setup();
    generateAssetsMock.mockRejectedValueOnce(new Error('provider exploded'));
    generateAssetsMock.mockResolvedValueOnce(makeTravelGuideResult());
    const props = renderGuideForm({}, '成都');

    await submitGuide(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('素材生成失败，请稍后重试。');
    expect(props.onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', {name: '重新生成'}));
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
  });

  it('历史保存失败不阻断完成并携带警告', async () => {
    const user = userEvent.setup();
    generateAssetsMock.mockResolvedValue(makeTravelGuideResult());
    const onComplete = vi.fn();
    renderGuideForm({onComplete, saveResult: vi.fn().mockRejectedValue(new Error('idb full'))}, '成都');

    await submitGuide(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const completion = onComplete.mock.calls[0][0] as WorkflowCompletion;
    expect(completion.historySaveWarning).toBe('素材已经生成，但未能保存到本机历史。请先下载素材包。');
    expect(completion.userPrompt).toBe('成都');
    expect(completion.result.requestId).toBe('request-guide');
  });
});

describe('UgcPhotoCampaignCreateForm', () => {
  function renderUgcForm(
    props: Partial<WorkflowFormProps> = {},
    initialCampaignTheme?: string,
    initialPhotoFiles?: File[],
  ) {
    const formProps = {...makeFormProps(), ...props};
    render(
      <UgcPhotoCampaignCreateForm
        initialCampaignTheme={initialCampaignTheme}
        initialPhotoFiles={initialPhotoFiles}
        template={getTemplateConfig('ugc-photo-campaign')}
        {...formProps}
      />,
    );
    return formProps;
  }

  async function submitUgc(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', {name: '开始生成'}));
  }

  it('预填初始活动主题', () => {
    renderUgcForm({}, '夏天的风');

    expect(screen.getByLabelText('活动主题，可选')).toHaveValue('夏天的风');
  });

  it('无投稿照片阻止提交并提示', async () => {
    const user = userEvent.setup();
    const props = renderUgcForm();

    await submitUgc(user);

    expect(screen.getByRole('alert')).toHaveTextContent('请上传 1～7 张投稿照片');
    expect(uploadReferenceFilesMock).not.toHaveBeenCalled();
    expect(generateAssetsMock).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('第八张投稿照片被拒绝并提示', async () => {
    const user = userEvent.setup();
    renderUgcForm();

    await user.upload(
      screen.getByLabelText(/选择投稿照片/),
      ['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png', 'g.png', 'h.png'].map(imageFile),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('最多上传 7 张图片，已忽略 1 个超出数量的文件。');
    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(7);
  });

  it('照片与投稿昵称随请求提交，主题留空不发送', async () => {
    const user = userEvent.setup();
    const files = [imageFile('photo-1.png'), imageFile('photo-2.png')];
    uploadReferenceFilesMock.mockResolvedValue(files.map((file, index) => makeAsset(`asset-${index + 1}`, file.name)));
    generateAssetsMock.mockResolvedValue(makeUgcPhotoCampaignResult());
    const props = renderUgcForm();

    await user.upload(screen.getByLabelText(/选择投稿照片/), files);
    await user.type(screen.getByLabelText('第 1 张图片的投稿昵称'), '阿紫');
    await submitUgc(user);

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(uploadReferenceFilesMock).toHaveBeenCalledWith(files, expect.any(AbortSignal));
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1', 'asset-2'],
      photoCredits: ['阿紫', ''],
    });
    expect(props.saveResult).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: 'ugc-photo-campaign',
      userPrompt: '',
    }));
  });

  it('活动主题随请求提交', async () => {
    const user = userEvent.setup();
    const files = [imageFile('photo-1.png')];
    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-1', 'photo-1.png')]);
    generateAssetsMock.mockResolvedValue(makeUgcPhotoCampaignResult());
    const onComplete = vi.fn();
    renderUgcForm({onComplete});

    await user.type(screen.getByLabelText('活动主题，可选'), '夏天的风');
    await user.upload(screen.getByLabelText(/选择投稿照片/), files);
    await submitUgc(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(generateAssetsMock.mock.calls[0][0]).toEqual({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1'],
      campaignTheme: '夏天的风',
      photoCredits: [''],
    });
    const completion = onComplete.mock.calls[0][0] as WorkflowCompletion;
    expect(completion.userPrompt).toBe('夏天的风');
  });

  it('从历史恢复投稿照片并可直接提交', async () => {
    const user = userEvent.setup();
    const restoredFiles = [imageFile('restored-1.png')];
    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-restored', 'restored-1.png')]);
    generateAssetsMock.mockResolvedValue(makeUgcPhotoCampaignResult());
    const props = renderUgcForm({}, '夏天的风', restoredFiles);

    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(1);
    expect(within(previews).getByText('restored-1.png')).toBeInTheDocument();

    await submitUgc(user);

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(uploadReferenceFilesMock).toHaveBeenCalledWith(restoredFiles, expect.any(AbortSignal));
  });

  it('投稿照片上传失败显示安全错误且可重试', async () => {
    const user = userEvent.setup();
    const files = [imageFile('photo-1.png')];
    uploadReferenceFilesMock.mockRejectedValueOnce(new Error('upload failed'));
    generateAssetsMock.mockResolvedValue(makeUgcPhotoCampaignResult());
    const props = renderUgcForm();

    await user.upload(screen.getByLabelText(/选择投稿照片/), files);
    await submitUgc(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('投稿照片上传失败，请稍后重试。');
    expect(generateAssetsMock).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
    const previews = screen.getByRole('list', {name: '已选择的图片'});
    expect(within(previews).getAllByRole('listitem')).toHaveLength(1);

    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-1', 'photo-1.png')]);
    await user.click(screen.getByRole('button', {name: '重新生成'}));

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
  });

  it('生成失败显示安全错误并可重试', async () => {
    const user = userEvent.setup();
    const files = [imageFile('photo-1.png')];
    uploadReferenceFilesMock.mockResolvedValue([makeAsset('asset-1', 'photo-1.png')]);
    generateAssetsMock.mockRejectedValueOnce(new Error('provider exploded'));
    generateAssetsMock.mockResolvedValueOnce(makeUgcPhotoCampaignResult());
    const props = renderUgcForm();

    await user.upload(screen.getByLabelText(/选择投稿照片/), files);
    await submitUgc(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('素材生成失败，请稍后重试。');

    await user.click(screen.getByRole('button', {name: '重新生成'}));
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
  });
});

describe('WorkflowCreateRouter', () => {
  it('按 workflowId 分派原创 IP 表单', async () => {
    getActiveIpProfileMock.mockResolvedValue(makeLockedProfile());
    render(
      <WorkflowCreateRouter
        onComplete={vi.fn()}
        saveResult={vi.fn().mockResolvedValue(undefined)}
        template={getTemplateConfig('original-ip')}
      />,
    );

    expect(await screen.findByRole('heading', {name: '山灵君'})).toBeVisible();
    expect(screen.getByLabelText('产品描述')).toBeVisible();
  });

  it('按 workflowId 分派图鉴表单', () => {
    render(
      <WorkflowCreateRouter
        onComplete={vi.fn()}
        saveResult={vi.fn().mockResolvedValue(undefined)}
        template={getTemplateConfig('xhs-atlas')}
      />,
    );

    expect(screen.getByLabelText('图鉴选题')).toBeVisible();
    expect(screen.queryByLabelText('产品描述')).not.toBeInTheDocument();
  });

  it('按 workflowId 分派手绘攻略表单', () => {
    render(
      <WorkflowCreateRouter
        initialPrompt="成都"
        onComplete={vi.fn()}
        saveResult={vi.fn().mockResolvedValue(undefined)}
        template={getTemplateConfig('travel-guide')}
      />,
    );

    expect(screen.getByLabelText('目的地')).toBeVisible();
    expect(screen.getByLabelText('目的地')).toHaveValue('成都');
    expect(screen.queryByLabelText('图鉴选题')).not.toBeInTheDocument();
  });

  it('按 workflowId 分派游客返图表单', () => {
    render(
      <WorkflowCreateRouter
        initialPrompt="夏天的风"
        onComplete={vi.fn()}
        saveResult={vi.fn().mockResolvedValue(undefined)}
        template={getTemplateConfig('ugc-photo-campaign')}
      />,
    );

    expect(screen.getByLabelText('活动主题，可选')).toBeVisible();
    expect(screen.getByLabelText('活动主题，可选')).toHaveValue('夏天的风');
    expect(screen.getByText('还没有选择投稿照片')).toBeVisible();
  });
});
