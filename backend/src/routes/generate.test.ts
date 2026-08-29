// @vitest-environment node
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  GenerateRequest,
  GenerateResult,
  OriginalIpRequest,
  OriginalIpResult,
  TravelGuideRequest,
  TravelGuideResult,
  UgcPhotoCampaignRequest,
  UgcPhotoCampaignResult,
  XhsAtlasRequest,
  XhsAtlasResult,
} from '../../../shared/workflows';
import {createApp} from '../app';
import {ApiError} from '../http/apiError';
import type {Workflow, WorkflowContext} from '../workflows/contracts';
import {createWorkflowRegistry} from '../workflows/registry';

function asWorkflow<TRequest extends GenerateRequest, TResult extends GenerateResult>(
  workflow: Workflow<TRequest, TResult>,
): Workflow {
  return workflow;
}

function makeOriginalIpResult(requestId: string): OriginalIpResult {
  return {
    requestId,
    workflowId: 'original-ip',
    status: 'succeeded',
    pages: [],
    warnings: [],
    copy: {title: '玉兔望月', body: '正文', tags: ['中秋']},
    ipProfileId: 'profile-1',
    ipProfileVersion: 1,
  };
}

function makeXhsAtlasResult(requestId: string): XhsAtlasResult {
  return {
    requestId,
    workflowId: 'xhs-atlas',
    status: 'succeeded',
    pages: [],
    warnings: [],
    copy: {titles: ['标题一', '标题二', '标题三'], body: '正文', tags: ['#美食']},
    topic: '贵阳的12种美食',
    list: {
      meta: {
        userTitle: '贵阳的12种美食',
        count: 12,
        measureWord: '种',
        domainType: '美食盘点',
        orgDimension: '按场景',
        themeWord: '美食',
        fieldLabels: ['怎么吃', '避坑'],
        motif: '一碗热气',
        palette: '美食暖橙',
        pageSlogans: ['一', '二', '三', '四', '五', '六'],
      },
      cover: {
        titleLine1: '贵阳的',
        titleLine2: '12种美食',
        highlightWord: '12种',
        stickyNote: '一共12种',
        bottomSlogan: '收藏这份清单',
      },
      items: [],
    },
  };
}

function makeTravelGuideResult(requestId: string): TravelGuideResult {
  return {
    requestId,
    workflowId: 'travel-guide',
    status: 'succeeded',
    pages: [],
    warnings: [],
    copy: {titles: ['标题一', '标题二', '标题三'], body: '正文', tags: ['#旅行攻略']},
    destination: '成都',
    days: 2,
    trip: {
      destination: '成都',
      days: 2,
      vibe: '一座来了就不想走的城市',
      tocNote: '两天一夜：古城漫游 + 熊猫与市井',
      cover: {
        titleLine1: '成都',
        titleLine2: '两天一夜漫游',
        subtitle: '照着走就行',
        topSpots: [{name: '宽窄巷子', oneLiner: '青砖灰瓦里的老成都'}],
      },
      dayPlans: [
        {
          day: 1,
          theme: '古城漫游',
          slogan: '把一天过慢',
          route: [
            {
              order: 1,
              spot: '人民公园',
              desc: '本地人的晨间客厅',
              illustration: '竹椅盖碗茶',
              feature: '市井茶馆',
              hours: '全天',
              ticket: '免费',
              recommend: '点一杯素毛峰',
            },
          ],
          links: [],
          tips: ['穿好走的鞋'],
        },
      ],
      transport: {
        arrival: [{way: '高铁成都东站', detail: '地铁2号线约20分钟'}],
        local: [{way: '地铁', detail: '扫码乘车最方便'}],
        pitfall: '别上黑车',
        slogan: '落地不慌',
      },
      stay: {
        areas: [{area: '春熙路太古里', fit: '首次游客', why: '地铁交汇去哪都方便'}],
        tiers: [{tier: '经济', range: '连锁酒店为主'}],
        logic: '首次来选春熙路',
        slogan: '住对地方',
      },
      food: {
        items: [{name: '钟水饺', eat: '红油甜辣口', where: '人民公园老字号'}],
        slogan: '辣是底线',
      },
    },
  };
}

function makeUgcPhotoCampaignResult(requestId: string): UgcPhotoCampaignResult {
  return {
    requestId,
    workflowId: 'ugc-photo-campaign',
    status: 'succeeded',
    pages: [],
    warnings: [],
    copy: {titles: ['标题一', '标题二', '标题三'], body: '正文', tags: ['#旅行']},
    mood: '治愈的海风',
    campaignTheme: '夏天的风',
  };
}

describe('POST /api/generate', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'guikesong-generate-route-'));
  });

  it('两个合法请求按 workflowId 精确分派', async () => {
    const originalRun = vi.fn(
      async (_input: OriginalIpRequest, context: WorkflowContext) => makeOriginalIpResult(context.requestId),
    );
    const xhsRun = vi.fn(
      async (_input: XhsAtlasRequest, context: WorkflowContext) => makeXhsAtlasResult(context.requestId),
    );
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([
        asWorkflow({id: 'original-ip', run: originalRun}),
        asWorkflow({id: 'xhs-atlas', run: xhsRun}),
      ]),
    });

    const originalRequest = {
      workflowId: 'original-ip',
      ipProfileId: 'profile-1',
      productAssetId: 'asset-1',
      productDescription: '米白陶瓷杯',
    };
    const originalResponse = await request(app)
      .post('/api/generate')
      .send(originalRequest)
      .expect(200);
    expect(originalResponse.body).toMatchObject({workflowId: 'original-ip', status: 'succeeded'});
    expect(originalRun).toHaveBeenCalledTimes(1);
    expect(originalRun).toHaveBeenCalledWith(originalRequest, {requestId: expect.any(String)});
    expect(xhsRun).not.toHaveBeenCalled();

    const xhsRequest = {
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: [],
    };
    await request(app).post('/api/generate').send(xhsRequest).expect(200);
    expect(xhsRun).toHaveBeenCalledTimes(1);
    expect(xhsRun).toHaveBeenCalledWith(xhsRequest, {requestId: expect.any(String)});
  });

  it('新工作流请求按 workflowId 精确分派', async () => {
    const travelRun = vi.fn(
      async (_input: TravelGuideRequest, context: WorkflowContext) => makeTravelGuideResult(context.requestId),
    );
    const ugcRun = vi.fn(
      async (_input: UgcPhotoCampaignRequest, context: WorkflowContext) => makeUgcPhotoCampaignResult(context.requestId),
    );
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([
        asWorkflow({id: 'travel-guide', run: travelRun}),
        asWorkflow({id: 'ugc-photo-campaign', run: ugcRun}),
      ]),
    });

    const travelRequest = {workflowId: 'travel-guide', destination: '成都'};
    const travelResponse = await request(app)
      .post('/api/generate')
      .send(travelRequest)
      .expect(200);
    expect(travelResponse.body).toMatchObject({workflowId: 'travel-guide', status: 'succeeded'});
    expect(travelRun).toHaveBeenCalledTimes(1);
    expect(travelRun).toHaveBeenCalledWith(travelRequest, {requestId: expect.any(String)});
    expect(ugcRun).not.toHaveBeenCalled();

    const ugcRequest = {
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1', 'asset-2', 'asset-3'],
      campaignTheme: '夏天的风',
      photoCredits: ['阿朱', '阿紫', ''],
    };
    await request(app).post('/api/generate').send(ugcRequest).expect(200);
    expect(ugcRun).toHaveBeenCalledTimes(1);
    expect(ugcRun).toHaveBeenCalledWith(ugcRequest, {requestId: expect.any(String)});
  });

  it('范围过大的目的地返回安全 400', async () => {
    const app = createApp({providerMode: 'mock', dataDir, registry: createWorkflowRegistry([])});

    const response = await request(app)
      .post('/api/generate')
      .send({workflowId: 'travel-guide', destination: '中国'})
      .expect(400);

    expect(response.body.code).toBe('DESTINATION_TOO_BROAD');
    expect(response.body.error).toContain('目的地范围过大');
  });

  it('超过 7 张投稿照片返回安全 400', async () => {
    const app = createApp({providerMode: 'mock', dataDir, registry: createWorkflowRegistry([])});

    const response = await request(app)
      .post('/api/generate')
      .send({
        workflowId: 'ugc-photo-campaign',
        photoAssetIds: Array.from({length: 8}, (_, index) => `asset-${index + 1}`),
      })
      .expect(400);

    expect(response.body.code).toBe('INVALID_REQUEST');
    expect(response.body.error).toContain('投稿照片最多 7 张');
  });

  it('未知 workflowId 返回安全 400', async () => {
    const app = createApp({providerMode: 'mock', dataDir, registry: createWorkflowRegistry([])});

    const response = await request(app)
      .post('/api/generate')
      .send({workflowId: 'unknown-workflow'})
      .expect(400);

    expect(response.body).toEqual({error: '未知工作流', code: 'UNKNOWN_WORKFLOW'});
  });

  it('额外字段被拒绝且不回显字段名', async () => {
    const run = vi.fn(
      async (_input: XhsAtlasRequest, context: WorkflowContext) => makeXhsAtlasResult(context.requestId),
    );
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([asWorkflow({id: 'xhs-atlas', run})]),
    });

    const response = await request(app)
      .post('/api/generate')
      .send({
        workflowId: 'xhs-atlas',
        topic: '贵阳的12种美食',
        referenceAssetIds: [],
        apiKey: 'should-not-leak',
      })
      .expect(400);

    expect(response.body.error).toBe('请求包含未知字段，请刷新页面后重试');
    expect(JSON.stringify(response.body)).not.toContain('apiKey');
    expect(run).not.toHaveBeenCalled();
  });

  it('无数字选题返回安全 400', async () => {
    const app = createApp({providerMode: 'mock', dataDir, registry: createWorkflowRegistry([])});

    const response = await request(app)
      .post('/api/generate')
      .send({workflowId: 'xhs-atlas', topic: '贵阳美食', referenceAssetIds: []})
      .expect(400);

    expect(response.body.code).toBe('TOPIC_MISSING_QUANTITY');
    expect(response.body.error).toContain('选题需包含数量');
  });

  it('工作流业务错误（未锁定 IP）返回 {error, code} 且无堆栈', async () => {
    const run = vi.fn(async () => {
      throw new ApiError(409, 'IP 档案未锁定，无法生成', 'IP_PROFILE_NOT_LOCKED');
    });
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([asWorkflow({id: 'original-ip', run})]),
    });

    const response = await request(app)
      .post('/api/generate')
      .send({
        workflowId: 'original-ip',
        ipProfileId: 'profile-1',
        productAssetId: 'asset-1',
        productDescription: '米白陶瓷杯',
      })
      .expect(409);

    expect(response.body).toEqual({error: 'IP 档案未锁定，无法生成', code: 'IP_PROFILE_NOT_LOCKED'});
    expect(JSON.stringify(response.body)).not.toMatch(/at\s|\/Users\/|node:internal/);
  });

  it('上游错误被收敛为安全 500，不泄露路径与堆栈', async () => {
    const run = vi.fn(async () => {
      throw new Error('ENOENT: no such file, open /Users/secret/key.json\n    at fn (/srv/app.js:3:2)');
    });
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([asWorkflow({id: 'original-ip', run})]),
    });

    const response = await request(app)
      .post('/api/generate')
      .send({
        workflowId: 'original-ip',
        ipProfileId: 'profile-1',
        productAssetId: 'asset-1',
        productDescription: '米白陶瓷杯',
      })
      .expect(500);

    expect(response.body).toEqual({error: '服务暂时不可用，请稍后重试', code: 'INTERNAL_ERROR'});
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('/srv/app.js');
    expect(serialized).not.toContain('key.json');
    expect(serialized).not.toContain('ENOENT');
  });

  it('未知接口返回 404', async () => {
    const app = createApp({providerMode: 'mock', dataDir});

    await request(app)
      .get('/api/not-exists')
      .expect(404)
      .expect({error: '接口不存在', code: 'NOT_FOUND'});
  });
});
