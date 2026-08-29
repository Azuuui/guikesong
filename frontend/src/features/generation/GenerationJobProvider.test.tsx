import {act, fireEvent, render, screen} from '@testing-library/react';
import {useEffect} from 'react';
import {MemoryRouter, Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {GenerationJobSnapshot} from '../../../../shared/generationJobs';
import {makeGenerateResult} from '../../test/fixtures';
import {
  generationJobRepository,
  readActiveJobId,
} from './generationJobRepository';
import {
  GenerationJobProvider,
  useGenerationJob,
  type GenerationJobContextValue,
  type GenerationJobDependencies,
  type StartGenerationInput,
} from './GenerationJobProvider';
import {ApiError} from './api';

/**
 * 只 fake setTimeout/clearTimeout/Date：
 * fake-indexeddb 依赖 setImmediate（外域真实实现）完成事务调度，
 * 默认 fake timers 会连 setImmediate 一起替换导致 IndexedDB 死锁。
 */
function useTestFakeTimers() {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date']});
}

const NOW = '2026-08-30T00:00:00.000Z';

function makeSnapshot(overrides: Partial<GenerationJobSnapshot> = {}): GenerationJobSnapshot {
  return {
    jobId: 'job-1',
    workflowId: 'xhs-atlas',
    status: 'queued',
    phase: 'preparing',
    completedImages: 0,
    totalImages: 0,
    createdAt: NOW,
    updatedAt: NOW,
    result: null,
    error: null,
    ...overrides,
  };
}

const RESULT = makeGenerateResult({workflowId: 'xhs-atlas', requestId: 'job-1'});

const SUBMISSION: StartGenerationInput = {
  request: {workflowId: 'xhs-atlas', topic: '2个贵州景点', referenceAssetIds: []},
  userPrompt: '2个贵州景点',
  referenceFiles: [],
};

const createGenerationJobMock = vi.fn();
const getGenerationJobMock = vi.fn();
const saveHistoryMock = vi.fn();

const DEPENDENCIES: GenerationJobDependencies = {
  createGenerationJob: createGenerationJobMock,
  getGenerationJob: getGenerationJobMock,
  saveHistory: saveHistoryMock,
};

function mockCreate(jobId = 'job-1') {
  createGenerationJobMock.mockResolvedValueOnce({jobId, status: 'queued', createdAt: NOW});
}

let probe: GenerationJobContextValue | null = null;

function Probe() {
  const value = useGenerationJob();
  useEffect(() => {
    probe = value;
  });
  return null;
}

function HomePageProbe() {
  const navigate = useNavigate();
  return (
    <div>
      <Probe />
      <button type="button" onClick={() => navigate('/other')}>去其他页面</button>
    </div>
  );
}

function OtherPageProbe() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" onClick={() => navigate('/')}>返回主页</button>
    </div>
  );
}

function ResultPageProbe() {
  const {pathname, state} = useLocation();
  const result = (state as {result?: {requestId?: string}} | null)?.result;
  return <div data-testid="result-route">{pathname}|{result?.requestId ?? 'no-result'}</div>;
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <GenerationJobProvider dependencies={DEPENDENCIES}>
        <Routes>
          <Route path="/" element={<HomePageProbe />} />
          <Route path="/other" element={<OtherPageProbe />} />
          <Route path="/results/:requestId" element={<ResultPageProbe />} />
        </Routes>
      </GenerationJobProvider>
    </MemoryRouter>,
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('GenerationJobProvider', () => {
  beforeEach(async () => {
    localStorage.clear();
    await generationJobRepository.clear();
    createGenerationJobMock.mockReset();
    getGenerationJobMock.mockReset();
    saveHistoryMock.mockReset();
    probe = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('提交后立即返回 queued 并轮询至终态，历史只保存一次', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock
      .mockResolvedValueOnce(makeSnapshot({status: 'running', phase: 'content'}))
      .mockResolvedValueOnce(makeSnapshot({status: 'succeeded', result: RESULT}));
    saveHistoryMock.mockResolvedValueOnce(undefined);

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });

    expect(createGenerationJobMock).toHaveBeenCalledTimes(1);
    expect(probe!.connectionState).toBe('connected');

    await flush();
    expect(probe!.activeJob).toMatchObject({jobId: 'job-1', status: 'running', phase: 'content'});

    await advance(2_000);
    expect(probe!.activeJob).toMatchObject({status: 'succeeded'});
    expect(saveHistoryMock).toHaveBeenCalledTimes(1);
    expect(saveHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      userPrompt: '2个贵州景点',
    }));

    // 终态后停止轮询，也不重复保存历史。
    await advance(10_000);
    expect(getGenerationJobMock).toHaveBeenCalledTimes(2);
    expect(saveHistoryMock).toHaveBeenCalledTimes(1);
  });

  it('路由切换不终止轮询，返回主页仍显示同一任务', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock
      .mockResolvedValueOnce(makeSnapshot({status: 'running'}))
      .mockResolvedValueOnce(makeSnapshot({status: 'running', phase: 'images'}));

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: '去其他页面'}));
    });
    expect(screen.getByRole('button', {name: '返回主页'})).toBeInTheDocument();

    // 主页组件已卸载，轮询仍继续。
    await advance(2_000);
    expect(getGenerationJobMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: '返回主页'}));
    });
    expect(probe!.activeJob).toMatchObject({jobId: 'job-1', status: 'running', phase: 'images'});
  });

  it('重挂载后从本地记录恢复同一任务，不重复提交生成', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'running'}));

    const first = renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();
    first.unmount();

    // 模拟刷新：React 状态丢失，localStorage 与 IndexedDB 保留。
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'succeeded', result: RESULT}));
    saveHistoryMock.mockResolvedValueOnce(undefined);

    renderProvider();
    await flush();

    expect(createGenerationJobMock).toHaveBeenCalledTimes(1);
    expect(probe!.activeJob).toMatchObject({jobId: 'job-1', status: 'succeeded'});
    expect(saveHistoryMock).toHaveBeenCalledTimes(1);
    expect(saveHistoryMock).toHaveBeenCalledWith(expect.objectContaining({jobId: 'job-1'}));
  });

  it('任务历史已保存后重挂载不再重复写入', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'succeeded', result: RESULT}));

    const first = renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();
    expect(saveHistoryMock).toHaveBeenCalledTimes(1);
    first.unmount();

    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'succeeded', result: RESULT}));
    renderProvider();
    await flush();

    expect(saveHistoryMock).toHaveBeenCalledTimes(1);
  });

  it('查询网络失败进入 reconnecting 并按退避继续轮询', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock
      .mockRejectedValueOnce(new ApiError(0, '网络异常'))
      .mockRejectedValueOnce(new ApiError(0, '网络异常'))
      .mockResolvedValueOnce(makeSnapshot({status: 'running'}));

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();

    expect(probe!.connectionState).toBe('reconnecting');
    expect(probe!.activeJob).toMatchObject({status: 'queued'});

    // 第一次失败退避 2 秒。
    await advance(1_999);
    expect(getGenerationJobMock).toHaveBeenCalledTimes(1);
    await advance(1);
    await flush();
    expect(getGenerationJobMock).toHaveBeenCalledTimes(2);
    expect(probe!.connectionState).toBe('reconnecting');

    // 第二次失败退避 4 秒，恢复后回到 connected。
    await advance(3_999);
    expect(getGenerationJobMock).toHaveBeenCalledTimes(2);
    await advance(1);
    await flush();
    expect(getGenerationJobMock).toHaveBeenCalledTimes(3);
    expect(probe!.connectionState).toBe('connected');
    expect(probe!.activeJob).toMatchObject({status: 'running'});
  });

  it('页面不可见时轮询间隔降为 5 秒', async () => {
    useTestFakeTimers();
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    mockCreate();
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status: 'running'}));

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();
    expect(getGenerationJobMock).toHaveBeenCalledTimes(1);

    await advance(2_000);
    expect(getGenerationJobMock).toHaveBeenCalledTimes(1);
    await advance(3_000);
    expect(getGenerationJobMock).toHaveBeenCalledTimes(2);
    visibilitySpy.mockRestore();
  });

  it('已有非终态任务时拒绝再次提交', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'running'}));

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();

    await expect(probe!.startGeneration(SUBMISSION)).rejects.toThrow('已有生成任务正在进行');
    expect(createGenerationJobMock).toHaveBeenCalledTimes(1);
  });

  it('创建请求尚未返回时并发提交只创建一个后端任务', async () => {
    useTestFakeTimers();
    vi.spyOn(generationJobRepository, 'get').mockResolvedValue(undefined);
    let resolveCreate!: (value: {jobId: string; status: 'queued'; createdAt: string}) => void;
    createGenerationJobMock.mockImplementationOnce(() => new Promise(resolve => {
      resolveCreate = resolve;
    }));
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status: 'running'}));

    renderProvider();
    const first = probe!.startGeneration(SUBMISSION);
    const second = probe!.startGeneration(SUBMISSION);
    await vi.waitFor(() => expect(createGenerationJobMock).toHaveBeenCalledTimes(1));
    resolveCreate({jobId: 'job-1', status: 'queued', createdAt: NOW});

    await act(async () => {
      await first;
      await expect(second).rejects.toThrow('已有生成任务正在进行');
    });
    expect(createGenerationJobMock).toHaveBeenCalledTimes(1);
  });

  it('后端接单后本地任务持久化失败仍继续轮询并保留任务', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'running'}));
    vi.spyOn(generationJobRepository, 'get').mockResolvedValue(undefined);
    vi.spyOn(generationJobRepository, 'put').mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));

    renderProvider();
    await act(async () => {
      await expect(probe!.startGeneration(SUBMISSION)).resolves.toBeUndefined();
    });
    await flush();

    expect(probe!.activeJob).toMatchObject({jobId: 'job-1', status: 'running'});
    expect(getGenerationJobMock).toHaveBeenCalledTimes(1);
  });

  it('取消轮询时把 AbortSignal 传给查询请求', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'running'}));

    const rendered = renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();

    const signal = getGenerationJobMock.mock.calls[0]?.[1];
    expect(signal).toBeInstanceOf(AbortSignal);
    rendered.unmount();
    expect(signal.aborted).toBe(true);
  });

  it('终态任务后可以发起新任务', async () => {
    useTestFakeTimers();
    mockCreate('job-1');
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'succeeded', result: RESULT}));
    saveHistoryMock.mockResolvedValueOnce(undefined);

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();
    expect(probe!.activeJob).toMatchObject({status: 'succeeded'});

    mockCreate('job-2');
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({jobId: 'job-2', status: 'running'}));
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();
    expect(probe!.activeJob).toMatchObject({jobId: 'job-2', status: 'running'});
  });

  it('任务不存在或过期时清除本地任务并允许重新生成', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock
      .mockResolvedValueOnce(makeSnapshot({status: 'running'}))
      .mockRejectedValueOnce(new ApiError(404, '任务不存在'));

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();

    await advance(2_000);
    await flush();
    expect(probe!.activeJob).toBeNull();
    expect(probe!.jobExpired).toBe(true);
    expect(probe!.connectionState).toBe('idle');
    expect(readActiveJobId()).toBeNull();
    await expect(generationJobRepository.get()).resolves.toBeUndefined();

    mockCreate('job-2');
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({jobId: 'job-2', status: 'running'}));
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();
    expect(probe!.jobExpired).toBe(false);
    expect(probe!.activeJob).toMatchObject({jobId: 'job-2', status: 'running'});
  });

  it('历史保存失败时保留结果并可重试', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'succeeded', result: RESULT}));
    saveHistoryMock.mockRejectedValueOnce(new Error('写入失败'));

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();

    expect(probe!.activeJob).toMatchObject({status: 'succeeded'});
    expect(probe!.historySaveWarning).toBeDefined();

    saveHistoryMock.mockResolvedValueOnce(undefined);
    await act(async () => {
      await probe!.retryHistorySave();
    });
    expect(probe!.historySaveWarning).toBeUndefined();
    expect(saveHistoryMock).toHaveBeenCalledTimes(2);
  });

  it('openResult 携带结果导航到结果页并标记已查看', async () => {
    useTestFakeTimers();
    mockCreate();
    getGenerationJobMock.mockResolvedValueOnce(makeSnapshot({status: 'succeeded', result: RESULT}));
    saveHistoryMock.mockResolvedValueOnce(undefined);

    renderProvider();
    await act(async () => {
      await probe!.startGeneration(SUBMISSION);
    });
    await flush();

    await act(async () => {
      await probe!.openResult();
    });
    expect(screen.getByTestId('result-route')).toHaveTextContent('/results/job-1|job-1');
    expect(probe!.resultViewed).toBe(true);
  });
});
