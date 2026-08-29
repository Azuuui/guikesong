import {mkdir, mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {GenerateRequest, GenerateResult} from '../../../shared/workflows';
import {GenerationJobStore} from './generationJobStore';

const REQUEST: GenerateRequest = {
  workflowId: 'xhs-atlas',
  topic: '贵阳的12种美食',
  referenceAssetIds: [],
};

/** 最小合法终态结果：共享守卫只校验对象存在且 workflowId 一致。 */
const RESULT = {
  requestId: 'job-1',
  workflowId: 'xhs-atlas',
  status: 'succeeded',
  pages: [],
  warnings: [],
} as unknown as GenerateResult;

function jobPath(baseDir: string, jobId: string): string {
  return path.join(baseDir, `${jobId}.json`);
}

describe('generation job store', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'guikesong-jobs-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('create 后立即可读取 queued 快照', async () => {
    const store = new GenerationJobStore(baseDir, {now: () => new Date('2026-08-30T00:00:00.000Z')});
    const record = await store.create({jobId: 'job-1', request: REQUEST});

    expect(record.snapshot).toMatchObject({
      jobId: 'job-1',
      workflowId: 'xhs-atlas',
      status: 'queued',
      phase: 'preparing',
      completedImages: 0,
      totalImages: 0,
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
      result: null,
      error: null,
    });

    const loaded = await store.get('job-1');
    expect(loaded?.request).toEqual(REQUEST);
    expect(loaded?.snapshot.status).toBe('queued');
  });

  it('新建 Store 实例后可从磁盘恢复记录', async () => {
    const store = new GenerationJobStore(baseDir, {now: () => new Date('2026-08-30T00:00:00.000Z')});
    await store.create({jobId: 'job-1', request: REQUEST});
    await store.update('job-1', current => ({
      ...current,
      snapshot: {
        ...current.snapshot,
        status: 'succeeded',
        phase: 'finalizing',
        completedImages: 2,
        totalImages: 2,
        result: RESULT,
      },
    }));

    const reopened = new GenerationJobStore(baseDir, {now: () => new Date('2026-08-30T00:01:00.000Z')});
    await reopened.ready;
    const recovered = await reopened.get('job-1');
    expect(recovered?.request).toEqual(REQUEST);
    expect(recovered?.snapshot.status).toBe('succeeded');
    expect(recovered?.snapshot.phase).toBe('finalizing');
    expect(recovered?.snapshot.completedImages).toBe(2);
    expect(recovered?.snapshot.result).toEqual(RESULT);
  });

  it('写入采用临时文件加原子重命名，目录不留残余 tmp 文件', async () => {
    const store = new GenerationJobStore(baseDir);
    await store.create({jobId: 'job-1', request: REQUEST});
    await store.update('job-1', current => ({
      ...current,
      snapshot: {...current.snapshot, status: 'running'},
    }));

    const files = await readdir(baseDir);
    expect(files).toEqual(['job-1.json']);
  });

  it('recoverInterrupted 将非终态任务转为安全失败终态', async () => {
    const store = new GenerationJobStore(baseDir, {now: () => new Date('2026-08-30T00:00:00.000Z')});
    await store.create({jobId: 'job-1', request: REQUEST});
    await store.create({jobId: 'job-2', request: REQUEST});
    await store.update('job-1', current => ({
      ...current,
      snapshot: {...current.snapshot, status: 'running', phase: 'images'},
    }));

    // 写入一个终态记录：恢复流程不得改动终态。
    await store.update('job-2', current => ({
      ...current,
      snapshot: {...current.snapshot, status: 'failed', error: {code: 'X', message: 'x'}},
    }));

    const reopened = new GenerationJobStore(baseDir, {now: () => new Date('2026-08-30T00:01:00.000Z')});
    await reopened.ready;

    const interrupted = await reopened.get('job-1');
    expect(interrupted?.snapshot.status).toBe('failed');
    expect(interrupted?.snapshot.error).toEqual({
      code: 'JOB_INTERRUPTED',
      message: '生成任务已中断，请重新生成',
    });

    const untouched = await reopened.get('job-2');
    expect(untouched?.snapshot.status).toBe('failed');
    expect(untouched?.snapshot.error).toEqual({code: 'X', message: 'x'});
  });

  it('cleanup 删除超过保留期的任务文件', async () => {
    const t0 = new Date('2026-08-30T00:00:00.000Z');
    const store = new GenerationJobStore(baseDir, {now: () => t0});
    await store.create({jobId: 'job-1', request: REQUEST});

    // 用 25 小时后的时钟重开：job-1 应被清理。
    const later = new GenerationJobStore(baseDir, {now: () => new Date(t0.getTime() + 25 * 60 * 60 * 1000)});
    await later.ready;
    expect(await later.get('job-1')).toBeUndefined();
    expect(await readdir(baseDir)).toEqual([]);
  });

  it('cleanup 保留 24 小时内的任务文件', async () => {
    const t0 = new Date('2026-08-30T00:00:00.000Z');
    const store = new GenerationJobStore(baseDir, {now: () => t0});
    await store.create({jobId: 'job-1', request: REQUEST});

    const reopened = new GenerationJobStore(baseDir, {now: () => new Date(t0.getTime() + 23 * 60 * 60 * 1000)});
    await reopened.ready;
    expect(await reopened.get('job-1')).toBeDefined();
  });

  it('损坏的任务文件返回 undefined 并留下日志', async () => {
    const store = new GenerationJobStore(baseDir);
    await store.ready;
    await writeFile(jobPath(baseDir, 'job-broken'), '{not json', 'utf8');

    expect(await store.get('job-broken')).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
    // 再次读取仍然安全：文件被清理后不再重复告警。
    await expect(store.get('job-broken')).resolves.toBeUndefined();
  });

  it('守卫失败的任务文件按损坏处理', async () => {
    const store = new GenerationJobStore(baseDir);
    await store.ready;
    await mkdir(baseDir, {recursive: true});
    await writeFile(
      jobPath(baseDir, 'job-invalid'),
      JSON.stringify({request: REQUEST, snapshot: {jobId: 'job-invalid', status: 'paused'}}),
      'utf8',
    );

    expect(await store.get('job-invalid')).toBeUndefined();
  });

  it('非法 jobId 不得形成路径穿越', async () => {
    const store = new GenerationJobStore(baseDir);
    await store.ready;

    await expect(store.get('../outside')).resolves.toBeUndefined();
    await expect(store.get('a/b')).resolves.toBeUndefined();
    await expect(store.get('')).resolves.toBeUndefined();
    await expect(store.create({jobId: '../escape', request: REQUEST})).rejects.toThrow();
    // 目录里没有生成任何文件。
    expect(await readdir(baseDir)).toEqual([]);
  });

  it('update 缺失记录时报错而不是创建新文件', async () => {
    const store = new GenerationJobStore(baseDir);
    await store.ready;
    await expect(
      store.update('missing', current => current),
    ).rejects.toThrow();
    expect(await readdir(baseDir)).toEqual([]);
  });

  it('记录文件内容为 JSON 且不含提示词等敏感字段', async () => {
    const store = new GenerationJobStore(baseDir);
    await store.create({jobId: 'job-1', request: REQUEST});
    const raw = await readFile(jobPath(baseDir, 'job-1'), 'utf8');
    const parsed = JSON.parse(raw) as {request: unknown; snapshot: unknown};
    expect(Object.keys(parsed).sort()).toEqual(['request', 'snapshot']);
  });
});
