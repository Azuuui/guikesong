import {beforeEach, describe, expect, it} from 'vitest';
import type {GenerateRequest} from '../../../../shared/types';
import type {StoredReferenceFile} from '../history/historyTypes';
import {
  ACTIVE_JOB_ID_STORAGE_KEY,
  generationJobRepository,
  readActiveJobId,
} from './generationJobRepository';

const REQUEST: GenerateRequest = {
  workflowId: 'xhs-atlas',
  topic: '贵阳的12种美食',
  referenceAssetIds: [],
};

function makeStoredReferenceFile(name = 'a.png'): StoredReferenceFile {
  const blob = new Blob([name], {type: 'image/png'});
  return {
    asset: {
      assetId: `asset-${name}`,
      url: `/api/reference-assets/${name}`,
      originalName: name,
      mediaType: 'image/png',
      size: blob.size,
      createdAt: '2026-08-29T00:00:00.000Z',
    },
    blob,
  };
}

describe('generation job repository', () => {
  beforeEach(async () => {
    localStorage.clear();
    await generationJobRepository.clear();
  });

  it('保存活动提交上下文并可在刷新后读取', async () => {
    await generationJobRepository.put({
      jobId: 'job-1',
      request: REQUEST,
      userPrompt: '2个贵州景点',
      referenceFiles: [],
      historySaved: false,
    });

    expect(await generationJobRepository.get()).toMatchObject({
      jobId: 'job-1',
      request: REQUEST,
      userPrompt: '2个贵州景点',
      referenceFiles: [],
      historySaved: false,
    });
    expect(readActiveJobId()).toBe('job-1');
    expect(localStorage.getItem(ACTIVE_JOB_ID_STORAGE_KEY)).toBe('job-1');
  });

  it('put 自动补全 createdAt', async () => {
    const submission = await generationJobRepository.put({
      jobId: 'job-1',
      request: REQUEST,
      userPrompt: '2个贵州景点',
      referenceFiles: [],
      historySaved: false,
    });

    expect(submission.createdAt).toEqual(expect.any(String));
    expect(Date.parse(submission.createdAt)).not.toBeNaN();
    expect((await generationJobRepository.get())?.createdAt).toBe(submission.createdAt);
  });

  it('参考图资产元数据随任务上下文保存', async () => {
    await generationJobRepository.put({
      jobId: 'job-1',
      request: REQUEST,
      userPrompt: '2个贵州景点',
      referenceFiles: [makeStoredReferenceFile('a.png'), makeStoredReferenceFile('b.png')],
      historySaved: false,
    });

    const stored = await generationJobRepository.get();
    // fake-indexeddb 在 jsdom 下无法结构化克隆 Blob，往返后 blob 为空对象；
    // 生产浏览器可完整往返，此处只断言其余字段。
    expect(stored?.referenceFiles.map(file => file.asset.assetId)).toEqual(['asset-a.png', 'asset-b.png']);
    expect(stored?.referenceFiles.map(file => file.asset.originalName)).toEqual(['a.png', 'b.png']);
  });

  it('重复 put 覆盖旧任务，保持单一活动任务', async () => {
    await generationJobRepository.put({
      jobId: 'job-1',
      request: REQUEST,
      userPrompt: '2个贵州景点',
      referenceFiles: [],
      historySaved: false,
    });
    await generationJobRepository.put({
      jobId: 'job-2',
      request: REQUEST,
      userPrompt: '3个贵州景点',
      referenceFiles: [],
      historySaved: false,
    });

    expect((await generationJobRepository.get())?.jobId).toBe('job-2');
    expect(readActiveJobId()).toBe('job-2');
  });

  it('markHistorySaved 只作用于当前任务且幂等', async () => {
    await generationJobRepository.put({
      jobId: 'job-1',
      request: REQUEST,
      userPrompt: '2个贵州景点',
      referenceFiles: [],
      historySaved: false,
    });

    await generationJobRepository.markHistorySaved('job-2');
    expect((await generationJobRepository.get())?.historySaved).toBe(false);

    await generationJobRepository.markHistorySaved('job-1');
    expect((await generationJobRepository.get())?.historySaved).toBe(true);

    await generationJobRepository.markHistorySaved('job-1');
    expect((await generationJobRepository.get())?.historySaved).toBe(true);
  });

  it('clear 后任务上下文与快速发现键一并清空', async () => {
    await generationJobRepository.put({
      jobId: 'job-1',
      request: REQUEST,
      userPrompt: '2个贵州景点',
      referenceFiles: [],
      historySaved: false,
    });

    await generationJobRepository.clear();

    expect(await generationJobRepository.get()).toBeUndefined();
    expect(readActiveJobId()).toBeNull();
    expect(localStorage.getItem(ACTIVE_JOB_ID_STORAGE_KEY)).toBeNull();
  });

  it('无活动任务时 get 返回 undefined', async () => {
    expect(await generationJobRepository.get()).toBeUndefined();
    expect(readActiveJobId()).toBeNull();
  });
});
