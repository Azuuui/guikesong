// @vitest-environment node
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {GenerateRequest, GenerateResult} from '../../../shared/workflows';
import {ApiError} from '../http/apiError';
import {GenerationJobStore} from '../storage/generationJobStore';
import type {Workflow, WorkflowContext} from '../workflows/contracts';
import {createWorkflowRegistry} from '../workflows/registry';
import {GenerationJobRunner} from './generationJobRunner';

const REQUEST: GenerateRequest = {
  workflowId: 'xhs-atlas',
  topic: '贵阳的12种美食',
  referenceAssetIds: [],
};

/** 最小合法结果：快照守卫只校验对象存在且 workflowId 一致。 */
function makeResult(requestId: string): GenerateResult {
  return {
    requestId,
    workflowId: 'xhs-atlas',
    status: 'succeeded',
    pages: [],
    warnings: [],
  } as unknown as GenerateResult;
}

describe('generation job runner', () => {
  let baseDir: string;
  let store: GenerationJobStore;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'guikesong-runner-'));
    store = new GenerationJobStore(baseDir);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('成功路径：queued 推进到 running 并最终保存 succeeded 结果', async () => {
    const workflow: Workflow = {
      id: 'xhs-atlas',
      run: async (_input: GenerateRequest, context: WorkflowContext) => {
        await context.reportProgress?.({phase: 'preparing'});
        await context.reportProgress?.({phase: 'content'});
        await context.reportProgress?.({phase: 'images', completedImages: 0, totalImages: 2});
        await context.reportProgress?.({phase: 'images', completedImages: 1, totalImages: 2});
        // 中途查询：进度事件应已落盘且状态为 running
        const mid = await store.get('job-1');
        expect(mid?.snapshot.status).toBe('running');
        expect(mid?.snapshot.phase).toBe('images');
        expect(mid?.snapshot.completedImages).toBe(1);
        expect(mid?.snapshot.totalImages).toBe(2);
        await context.reportProgress?.({phase: 'finalizing', completedImages: 2, totalImages: 2});
        return makeResult(context.requestId);
      },
    };
    const runner = new GenerationJobRunner(store, createWorkflowRegistry([workflow]));
    await store.create({jobId: 'job-1', request: REQUEST});

    await runner.start('job-1', REQUEST);

    const finished = await store.get('job-1');
    expect(finished?.snapshot.status).toBe('succeeded');
    expect(finished?.snapshot.result?.requestId).toBe('job-1');
    expect(finished?.snapshot.phase).toBe('finalizing');
    expect(finished?.snapshot.completedImages).toBe(2);
    expect(finished?.snapshot.totalImages).toBe(2);
    expect(finished?.snapshot.error).toBeNull();
  });

  it('partial 结果映射为任务 partial 且保留结果', async () => {
    const workflow: Workflow = {
      id: 'xhs-atlas',
      run: async (_input: GenerateRequest, context: WorkflowContext) => ({
        ...makeResult(context.requestId),
        status: 'partial',
      }) as unknown as Promise<GenerateResult>,
    };
    const runner = new GenerationJobRunner(store, createWorkflowRegistry([workflow]));
    await store.create({jobId: 'job-1', request: REQUEST});

    await runner.start('job-1', REQUEST);

    const finished = await store.get('job-1');
    expect(finished?.snapshot.status).toBe('partial');
    expect(finished?.snapshot.result?.requestId).toBe('job-1');
    expect(finished?.snapshot.error).toBeNull();
  });

  it('工作流抛 ApiError 时保存其安全 code 与 message', async () => {
    const workflow: Workflow = {
      id: 'xhs-atlas',
      run: async () => {
        throw new ApiError(502, '上游图片生成失败', 'UPSTREAM_IMAGE_FAILED');
      },
    };
    const runner = new GenerationJobRunner(store, createWorkflowRegistry([workflow]));
    await store.create({jobId: 'job-1', request: REQUEST});

    await runner.start('job-1', REQUEST);

    const finished = await store.get('job-1');
    expect(finished?.snapshot.status).toBe('failed');
    expect(finished?.snapshot.error).toEqual({
      code: 'UPSTREAM_IMAGE_FAILED',
      message: '上游图片生成失败',
    });
    expect(finished?.snapshot.result).toBeNull();
  });

  it('未知异常收敛为 INTERNAL_ERROR 安全错误且不泄露细节', async () => {
    const workflow: Workflow = {
      id: 'xhs-atlas',
      run: async () => {
        throw new Error('秘密路径 /Users/secret/key.json at fn (/srv/app.js:3:2)');
      },
    };
    const runner = new GenerationJobRunner(store, createWorkflowRegistry([workflow]));
    await store.create({jobId: 'job-1', request: REQUEST});

    await expect(runner.start('job-1', REQUEST)).resolves.toBeUndefined();

    const finished = await store.get('job-1');
    expect(finished?.snapshot.status).toBe('failed');
    expect(finished?.snapshot.error).toEqual({code: 'INTERNAL_ERROR', message: '生成失败，请稍后重试'});
    expect(JSON.stringify(finished?.snapshot)).not.toContain('secret');
    expect(JSON.stringify(finished?.snapshot)).not.toContain('INTERNAL stack');
  });

  it('同一 jobId 只能启动一次，重复 start 不再执行工作流', async () => {
    const run = vi.fn(async (_input: GenerateRequest, context: WorkflowContext) =>
      makeResult(context.requestId),
    );
    const workflow: Workflow = {id: 'xhs-atlas', run};
    const runner = new GenerationJobRunner(store, createWorkflowRegistry([workflow]));
    await store.create({jobId: 'job-1', request: REQUEST});

    await runner.start('job-1', REQUEST);
    await runner.start('job-1', REQUEST);

    expect(run).toHaveBeenCalledTimes(1);
    expect((await store.get('job-1'))?.snapshot.status).toBe('succeeded');
  });

  it('任务记录不存在时 start 不产生未处理拒绝', async () => {
    const workflow: Workflow = {
      id: 'xhs-atlas',
      run: async (_input: GenerateRequest, context: WorkflowContext) => makeResult(context.requestId),
    };
    const runner = new GenerationJobRunner(store, createWorkflowRegistry([workflow]));

    await expect(runner.start('missing-job', REQUEST)).resolves.toBeUndefined();
    expect(await store.get('missing-job')).toBeUndefined();
  });
});
