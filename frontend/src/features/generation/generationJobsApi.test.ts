import {afterEach, describe, expect, it, vi} from 'vitest';
import type {
  CreateGenerationJobResponse,
  GenerationJobSnapshot,
} from '../../../../shared/generationJobs';
import type {GenerateRequest} from '../../../../shared/types';
import {makeXhsAtlasResult} from '../../test/fixtures';
import {ApiError} from './api';
import {
  createGenerationJob,
  GENERATION_JOB_REQUEST_TIMEOUT_MS,
  getGenerationJob,
} from './generationJobsApi';

const REQUEST: GenerateRequest = {
  workflowId: 'xhs-atlas',
  topic: '贵阳的12种美食',
  referenceAssetIds: [],
};

const NOW = '2026-08-30T00:00:00.000Z';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

function makeSnapshot(overrides: Partial<GenerationJobSnapshot> = {}): GenerationJobSnapshot {
  return {
    jobId: 'job-1',
    workflowId: 'xhs-atlas',
    status: 'running',
    phase: 'images',
    completedImages: 1,
    totalImages: 2,
    createdAt: NOW,
    updatedAt: NOW,
    result: null,
    error: null,
    ...overrides,
  };
}

describe('generation jobs api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('创建任务发送 POST 并返回 202 响应体', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({jobId: 'job-1', status: 'queued', createdAt: NOW} satisfies CreateGenerationJobResponse, 202),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createGenerationJob(REQUEST)).resolves.toEqual({
      jobId: 'job-1',
      status: 'queued',
      createdAt: NOW,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/generation-jobs');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(REQUEST);
  });

  it('查询任务返回运行中快照', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(makeSnapshot()));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getGenerationJob('job-1')).resolves.toMatchObject({
      phase: 'images',
      completedImages: 1,
      totalImages: 2,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/generation-jobs/job-1');
    expect(init?.method).toBe('GET');
  });

  it('终态快照的 result 通过完整结果守卫后返回', async () => {
    const result = makeXhsAtlasResult({requestId: 'job-1'});
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          makeSnapshot({status: 'succeeded', phase: 'finalizing', completedImages: 2, totalImages: 2, result}),
        ),
      ),
    );

    await expect(getGenerationJob('job-1')).resolves.toMatchObject({
      status: 'succeeded',
      result: {requestId: 'job-1'},
    });
  });

  it('终态 result 结构不完整时以安全错误拒绝', async () => {
    const badResult = {
      requestId: 'job-1',
      workflowId: 'xhs-atlas',
      status: 'succeeded',
      pages: [],
      warnings: [],
    } as unknown as GenerationJobSnapshot['result'];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(makeSnapshot({status: 'succeeded', result: badResult})),
      ),
    );

    await expect(getGenerationJob('job-1')).rejects.toMatchObject({
      status: 200,
      message: '任务结果数据无效，请稍后重试',
    });
  });

  it('创建接口的非法 200 响应被拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({jobId: 'job-1'})));

    await expect(createGenerationJob(REQUEST)).rejects.toMatchObject({
      status: 200,
      message: '任务创建失败，请稍后重试',
    });
  });

  it('查询接口的非法 200 响应被拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({status: 'running'})));

    await expect(getGenerationJob('job-1')).rejects.toMatchObject({
      status: 200,
      message: '任务状态查询失败，请稍后重试',
    });
  });

  it('404 任务过期时透传业务消息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({error: '任务不存在或已过期', code: 'JOB_NOT_FOUND'}, 404),
      ),
    );

    await expect(getGenerationJob('job-1')).rejects.toMatchObject({
      status: 404,
      message: '任务不存在或已过期',
    });
  });

  it('任务创建的业务错误透传安全白名单消息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({error: '选题需包含数量，如"贵阳的12种美食"', code: 'TOPIC_MISSING_QUANTITY'}, 400),
      ),
    );

    await expect(createGenerationJob(REQUEST)).rejects.toBeInstanceOf(ApiError);
  });

  it('查询采用 30 秒超时而非生成接口的 10 分钟超时', async () => {
    expect(GENERATION_JOB_REQUEST_TIMEOUT_MS).toBe(30_000);
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const pending = getGenerationJob('job-1');
      const rejection = expect(pending).rejects.toMatchObject({
        status: 0,
        message: '请求超时，请稍后重试',
      });

      await vi.advanceTimersByTimeAsync(GENERATION_JOB_REQUEST_TIMEOUT_MS - 1);
      const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal;
      expect(signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
