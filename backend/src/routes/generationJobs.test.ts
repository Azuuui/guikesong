// @vitest-environment node
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  GenerateRequest,
  GenerateResult,
  XhsAtlasRequest,
  XhsAtlasResult,
} from '../../../shared/workflows';
import {createApp} from '../app';
import {ApiError} from '../http/apiError';
import type {Workflow, WorkflowContext} from '../workflows/contracts';
import {createWorkflowRegistry} from '../workflows/registry';

const REQUEST: XhsAtlasRequest = {
  workflowId: 'xhs-atlas',
  topic: '贵阳的12种美食',
  referenceAssetIds: [],
};

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

interface TerminalSnapshot {
  jobId: string;
  status: string;
  result: GenerateResult | null;
  error: {code: string; message: string} | null;
}

/** 轮询任务接口直到进入终态。 */
async function waitForTerminal(
  app: ReturnType<typeof createApp>,
  jobId: string,
  timeoutMs = 3000,
): Promise<TerminalSnapshot> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await request(app).get(`/api/generation-jobs/${jobId}`).expect(200);
    if (['succeeded', 'partial', 'failed'].includes(response.body.status)) {
      return response.body;
    }
    if (Date.now() > deadline) {
      throw new Error(`任务 ${jobId} 未在时限内进入终态，当前状态 ${response.body.status}`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('generation jobs routes', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'guikesong-jobs-route-'));
  });

  it('创建任务立即返回 202 与 queued，随后可查询到 succeeded 终态', async () => {
    const run = vi.fn(
      async (_input: XhsAtlasRequest, context: WorkflowContext) => makeXhsAtlasResult(context.requestId),
    );
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([{id: 'xhs-atlas', run} as Workflow]),
    });

    const response = await request(app).post('/api/generation-jobs').send(REQUEST).expect(202);

    expect(response.body).toMatchObject({status: 'queued'});
    expect(response.body.jobId).toEqual(expect.any(String));
    expect(Object.keys(response.body).sort()).toEqual(['createdAt', 'jobId', 'status']);
    expect(JSON.stringify(response.body)).not.toMatch(/prompt|apiKey|\/Users\//);

    const final = await waitForTerminal(app, response.body.jobId);
    expect(final.jobId).toBe(response.body.jobId);
    expect(final.status).toBe('succeeded');
    expect(final.result).toMatchObject({
      requestId: response.body.jobId,
      workflowId: 'xhs-atlas',
    });
    expect(final.error).toBeNull();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(REQUEST, {
      requestId: response.body.jobId,
      reportProgress: expect.any(Function),
    });
  });

  it('创建响应不等待可控延迟工作流结束，运行中可查询进度', async () => {
    let resolveWorkflow!: () => void;
    let startedWorkflow!: () => void;
    const started = new Promise<void>(resolve => {
      startedWorkflow = resolve;
    });
    const run = vi.fn(async (_input: XhsAtlasRequest, context: WorkflowContext) => {
      await context.reportProgress?.({phase: 'images', completedImages: 1, totalImages: 2});
      startedWorkflow();
      await new Promise<void>(resolve => {
        resolveWorkflow = resolve;
      });
      return makeXhsAtlasResult(context.requestId);
    });
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([{id: 'xhs-atlas', run} as Workflow]),
    });

    const response = await request(app).post('/api/generation-jobs').send(REQUEST).expect(202);
    expect(response.body).toMatchObject({status: 'queued'});

    // 工作流已启动但被人为挂起：创建接口早已返回，任务仍非终态
    await started;
    const early = await request(app)
      .get(`/api/generation-jobs/${response.body.jobId}`)
      .expect(200);
    expect(['queued', 'running']).toContain(early.body.status);
    expect(early.body.result).toBeNull();
    expect(early.body.phase).toBe('images');
    expect(early.body.completedImages).toBe(1);
    expect(early.body.totalImages).toBe(2);

    resolveWorkflow();
    const final = await waitForTerminal(app, response.body.jobId);
    expect(final.status).toBe('succeeded');
  });

  it('工作流失败时任务终态为 failed 且错误安全', async () => {
    const run = vi.fn(async () => {
      throw new ApiError(502, '上游图片生成失败', 'UPSTREAM_IMAGE_FAILED');
    });
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([{id: 'xhs-atlas', run} as Workflow]),
    });

    const response = await request(app).post('/api/generation-jobs').send(REQUEST).expect(202);
    const final = await waitForTerminal(app, response.body.jobId);

    expect(final.status).toBe('failed');
    expect(final.error).toEqual({code: 'UPSTREAM_IMAGE_FAILED', message: '上游图片生成失败'});
    expect(final.result).toBeNull();
    expect(JSON.stringify(final)).not.toMatch(/stack|\/Users\//);
  });

  it('非法请求返回安全 400 且不创建任务', async () => {
    const run = vi.fn(
      async (_input: XhsAtlasRequest, context: WorkflowContext) => makeXhsAtlasResult(context.requestId),
    );
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([{id: 'xhs-atlas', run} as Workflow]),
    });

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({workflowId: 'xhs-atlas', topic: '贵阳美食', referenceAssetIds: []})
      .expect(400);

    expect(response.body.code).toBe('TOPIC_MISSING_QUANTITY');
    expect(run).not.toHaveBeenCalled();
  });

  it('未知 workflowId 返回安全 400', async () => {
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([]),
    });

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({workflowId: 'unknown-workflow'})
      .expect(400);

    expect(response.body).toEqual({error: '未知工作流', code: 'UNKNOWN_WORKFLOW'});
  });

  it('查询未知任务返回安全 404', async () => {
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([]),
    });

    const response = await request(app)
      .get('/api/generation-jobs/missing-job')
      .expect(404);

    expect(response.body).toEqual({error: '任务不存在或已过期', code: 'JOB_NOT_FOUND'});
  });

  it('旧 POST /api/generate 同步接口保持兼容', async () => {
    const run = vi.fn(
      async (_input: GenerateRequest, context: WorkflowContext) => makeXhsAtlasResult(context.requestId),
    );
    const app = createApp({
      providerMode: 'mock',
      dataDir,
      registry: createWorkflowRegistry([{id: 'xhs-atlas', run} as Workflow]),
    });

    const response = await request(app).post('/api/generate').send(REQUEST).expect(200);
    expect(response.body).toMatchObject({workflowId: 'xhs-atlas', status: 'succeeded'});
  });
});
