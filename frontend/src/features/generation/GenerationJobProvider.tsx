import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import type {
  CreateGenerationJobResponse,
  GenerationJobSnapshot,
} from '../../../../shared/generationJobs';
import type {GenerateRequest, GenerateResult} from '../../../../shared/types';
import {HISTORY_SAVE_WARNING} from '../create/types';
import type {StoredReferenceFile} from '../history/historyTypes';
import {captureHistoryRecord} from '../history/resultMaterializer';
import {historyRepository} from '../history/historyRepository';
import {ApiError} from './api';
import {
  generationJobRepository,
  readActiveJobId,
  withGenerationCreationLease,
  type ActiveGenerationSubmission,
} from './generationJobRepository';
import {createGenerationJob, getGenerationJob} from './generationJobsApi';

const ACTIVE_POLL_INTERVAL_MS = 2_000;
const HIDDEN_POLL_INTERVAL_MS = 5_000;
const FAILURE_BACKOFF_STEPS_MS = [2_000, 4_000, 5_000] as const;

export type GenerationJobConnectionState = 'idle' | 'connected' | 'reconnecting';

/** 主页发起后台生成所需的提交上下文。 */
export type StartGenerationInput = {
  request: GenerateRequest;
  userPrompt: string;
  referenceFiles: StoredReferenceFile[];
};

export type SaveGenerationHistoryInput = {
  jobId: string;
  result: GenerateResult;
  userPrompt: string;
  referenceFiles: StoredReferenceFile[];
  createdAt: string;
};

/** 终态结果写入现有 IndexedDB 历史前的幂等检查。 */
async function saveGenerationHistory({
  jobId,
  result,
  userPrompt,
  referenceFiles,
  createdAt,
}: SaveGenerationHistoryInput): Promise<void> {
  if (await historyRepository.has(jobId)) return;
  const record = await captureHistoryRecord({result, userPrompt, referenceFiles, createdAt});
  await historyRepository.put(record);
}

export type GenerationJobDependencies = {
  createGenerationJob: (request: GenerateRequest) => Promise<CreateGenerationJobResponse>;
  getGenerationJob: (jobId: string, signal?: AbortSignal) => Promise<GenerationJobSnapshot>;
  saveHistory: (input: SaveGenerationHistoryInput) => Promise<void>;
};

const DEFAULT_DEPENDENCIES: GenerationJobDependencies = {
  createGenerationJob: request => createGenerationJob(request),
  getGenerationJob: (jobId, signal) => getGenerationJob(jobId, signal),
  saveHistory: saveGenerationHistory,
};

function isTerminalStatus(status: GenerationJobSnapshot['status']): boolean {
  return status === 'succeeded' || status === 'partial' || status === 'failed';
}

export type GenerationJobContextValue = {
  activeJob: GenerationJobSnapshot | null;
  connectionState: GenerationJobConnectionState;
  /** 历史写入失败时保留结果并提示重试。 */
  historySaveWarning: string | undefined;
  /** 用户是否已查看终态结果；导航圆点据此收起。 */
  resultViewed: boolean;
  /** 任务过期或不存在时提示重新生成。 */
  jobExpired: boolean;
  startGeneration: (submission: StartGenerationInput) => Promise<void>;
  openResult: () => Promise<void>;
  retryHistorySave: () => Promise<void>;
};

const GenerationJobContext = createContext<GenerationJobContextValue | null>(null);
const GENERATION_START_LOCK = 'qianscape-generation-start';
const VIEWED_JOB_STORAGE_KEY = 'qianscape-generation-job-viewed';
let localStartQueue: Promise<void> = Promise.resolve();

function withLocalStartLock<T>(action: () => Promise<T>): Promise<T> {
  const run = localStartQueue.then(action, action);
  localStartQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function withGenerationStartLock<T>(action: () => Promise<T>): Promise<T> {
  return withLocalStartLock(async () => {
    const locks = navigator.locks;
    if (!locks) return withGenerationCreationLease(action);
    return locks.request(GENERATION_START_LOCK, {mode: 'exclusive'}, action);
  });
}

function deferred(): {promise: Promise<void>; resolve: () => void} {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return {promise, resolve};
}

function readViewedJobId(): string | null {
  try { return localStorage.getItem(VIEWED_JOB_STORAGE_KEY); } catch { return null; }
}

function clearViewedJobId(): void {
  try { localStorage.removeItem(VIEWED_JOB_STORAGE_KEY); } catch { /* storage may be disabled */ }
}

export function useGenerationJob(): GenerationJobContextValue {
  const value = useContext(GenerationJobContext);
  if (!value) {
    throw new Error('useGenerationJob 必须在 GenerationJobProvider 内使用');
  }
  return value;
}

export type GenerationJobProviderProps = {
  children: ReactNode;
  dependencies?: GenerationJobDependencies;
};

/**
 * 应用级生成任务上下文：创建任务、跨路由轮询、终态幂等保存历史。
 * Provider 挂载在路由内容之上，普通路由切换不会终止轮询。
 */
export function GenerationJobProvider({
  children,
  dependencies = DEFAULT_DEPENDENCIES,
}: GenerationJobProviderProps) {
  const navigate = useNavigate();
  const {pathname} = useLocation();
  const [activeJob, setActiveJob] = useState<GenerationJobSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<GenerationJobConnectionState>('idle');
  const [historySaveWarning, setHistorySaveWarning] = useState<string>();
  const [resultViewed, setResultViewed] = useState(false);
  const [jobExpired, setJobExpired] = useState(false);

  const dependenciesRef = useRef(dependencies);
  dependenciesRef.current = dependencies;
  const activeJobRef = useRef<GenerationJobSnapshot | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const submissionRef = useRef<ActiveGenerationSubmission | undefined>(undefined);
  const pollTimerRef = useRef<number | undefined>(undefined);
  const pollAbortRef = useRef<AbortController | undefined>(undefined);
  const failureCountRef = useRef(0);
  /** 任务代数：新任务开始后，旧任务的迟到响应与恢复流程全部作废。 */
  const pollGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const restoreReadyRef = useRef(deferred());

  function clearPollTimer() {
    if (pollTimerRef.current !== undefined) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = undefined;
    }
  }

  function schedulePoll(delayMs: number) {
    clearPollTimer();
    pollTimerRef.current = window.setTimeout(() => {
      void poll();
    }, delayMs);
  }

  function currentPollInterval(): number {
    return document.visibilityState === 'hidden' ? HIDDEN_POLL_INTERVAL_MS : ACTIVE_POLL_INTERVAL_MS;
  }

  function applySnapshot(snapshot: GenerationJobSnapshot) {
    const changedJob = activeJobIdRef.current !== snapshot.jobId;
    activeJobRef.current = snapshot;
    activeJobIdRef.current = snapshot.jobId;
    setActiveJob(snapshot);
    if (changedJob) setResultViewed(readViewedJobId() === snapshot.jobId);
  }

  function markResultViewed(jobId: string) {
    try { localStorage.setItem(VIEWED_JOB_STORAGE_KEY, jobId); } catch { /* storage may be disabled */ }
    setResultViewed(true);
  }

  function clearActiveJob() {
    activeJobRef.current = null;
    activeJobIdRef.current = null;
    submissionRef.current = undefined;
    setActiveJob(null);
  }

  async function persistHistory(snapshot: GenerationJobSnapshot): Promise<boolean> {
    const submission = submissionRef.current;
    if (!submission || submission.jobId !== snapshot.jobId) return true;
    if (!snapshot.result) return true;
    if (submission.historySaved) return true;
    try {
      await dependenciesRef.current.saveHistory({
        jobId: snapshot.jobId,
        result: snapshot.result,
        userPrompt: submission.userPrompt,
        referenceFiles: submission.referenceFiles,
        createdAt: submission.createdAt,
      });
      submissionRef.current = {...submission, historySaved: true};
      await generationJobRepository.markHistorySaved(snapshot.jobId);
      return true;
    } catch {
      return false;
    }
  }

  async function poll() {
    const generation = pollGenerationRef.current;
    const jobId = activeJobIdRef.current;
    if (!jobId) return;

    const controller = new AbortController();
    pollAbortRef.current = controller;
    try {
      const snapshot = await dependenciesRef.current.getGenerationJob(jobId, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      if (generation !== pollGenerationRef.current) return;

      failureCountRef.current = 0;
      setConnectionState('connected');
      applySnapshot(snapshot);

      if (isTerminalStatus(snapshot.status)) {
        clearPollTimer();
        const saved = await persistHistory(snapshot);
        if (!mountedRef.current || generation !== pollGenerationRef.current) return;
        setHistorySaveWarning(saved ? undefined : HISTORY_SAVE_WARNING);
        return;
      }
      schedulePoll(currentPollInterval());
    } catch (reason) {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (generation !== pollGenerationRef.current) return;

      if (reason instanceof ApiError && reason.status === 404) {
        // 任务过期或不存在：清除本地任务，提示重新生成。
        clearPollTimer();
        clearActiveJob();
        setConnectionState('idle');
        setJobExpired(true);
        await generationJobRepository.clear().catch(() => undefined);
        return;
      }

      failureCountRef.current += 1;
      setConnectionState('reconnecting');
      const index = Math.min(failureCountRef.current - 1, FAILURE_BACKOFF_STEPS_MS.length - 1);
      schedulePoll(FAILURE_BACKOFF_STEPS_MS[index]!);
    }
  }

  async function startGeneration(submission: StartGenerationInput): Promise<void> {
    await restoreReadyRef.current.promise;
    return withGenerationStartLock(async () => {
      const current = activeJobRef.current;
      if (current && !isTerminalStatus(current.status)) {
        throw new ApiError(0, '已有生成任务正在进行，请等待完成后再发起新的生成。');
      }

      const discoveredSubmission = await generationJobRepository.get();
      const discoveredJobId = readActiveJobId() ?? discoveredSubmission?.jobId ?? null;
      if (discoveredJobId && discoveredJobId !== current?.jobId) {
        try {
          const discovered = await dependenciesRef.current.getGenerationJob(discoveredJobId);
          if (!isTerminalStatus(discovered.status)) {
            throw new ApiError(0, '已有生成任务正在进行，请等待完成后再发起新的生成。');
          }
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
          await generationJobRepository.clear();
        }
      }

      const created = await dependenciesRef.current.createGenerationJob(submission.request);
      const queued: GenerationJobSnapshot = {
        jobId: created.jobId,
        workflowId: submission.request.workflowId,
        status: 'queued',
        phase: 'preparing',
        completedImages: 0,
        totalImages: 0,
        createdAt: created.createdAt,
        updatedAt: created.createdAt,
        result: null,
        error: null,
      };

      pollGenerationRef.current += 1;
      clearPollTimer();
      pollAbortRef.current?.abort();
      failureCountRef.current = 0;
      setHistorySaveWarning(undefined);
      setResultViewed(false);
      clearViewedJobId();
      setJobExpired(false);
      setConnectionState('connected');
      applySnapshot(queued);

      const localSubmission: ActiveGenerationSubmission = {
        jobId: created.jobId,
        request: submission.request,
        userPrompt: submission.userPrompt,
        referenceFiles: submission.referenceFiles,
        historySaved: false,
        createdAt: created.createdAt,
      };
      submissionRef.current = localSubmission;
      try {
        submissionRef.current = await generationJobRepository.put(localSubmission);
      } catch {
        // 后端已接单时，本地持久化失败不得中断当前轮询或隐藏结果。
      }
      void poll();
    });
  }

  async function retryHistorySave(): Promise<void> {
    const job = activeJobRef.current;
    if (!job?.result) return;
    const saved = await persistHistory(job);
    if (!mountedRef.current) return;
    setHistorySaveWarning(saved ? undefined : HISTORY_SAVE_WARNING);
  }

  async function openResult(): Promise<void> {
    const job = activeJobRef.current;
    if (!job?.result) return;
    const submission = submissionRef.current;
    markResultViewed(job.jobId);
    navigate(`/results/${job.result.requestId}`, {
      state: {
        result: job.result,
        userPrompt: submission?.userPrompt ?? '',
        createdAt: submission?.createdAt ?? job.createdAt,
        ...(historySaveWarning !== undefined ? {historySaveWarning} : {}),
      },
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function restore() {
      const generation = pollGenerationRef.current;
      const submission = await generationJobRepository.get();
      const jobId = readActiveJobId() ?? submission?.jobId ?? null;
      if (!jobId) return;
      if (cancelled || generation !== pollGenerationRef.current) return;
      if (!submission || submission.jobId !== jobId) {
        // 快速发现键指向的任务上下文已缺失：一并清空，避免残留。
        await generationJobRepository.clear().catch(() => undefined);
        return;
      }
      submissionRef.current = submission;
      activeJobIdRef.current = jobId;
      void poll();
    }

    void restore().finally(() => restoreReadyRef.current.resolve());

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearPollTimer();
      pollAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeJob || !isTerminalStatus(activeJob.status)) return;
    const viewingTask = pathname === '/history'
      || pathname === `/history/${activeJob.jobId}`
      || pathname === `/results/${activeJob.jobId}`;
    if (viewingTask) markResultViewed(activeJob.jobId);
  }, [activeJob, pathname]);

  const value: GenerationJobContextValue = {
    activeJob,
    connectionState,
    historySaveWarning,
    resultViewed,
    jobExpired,
    startGeneration,
    openResult,
    retryHistorySave,
  };

  return <GenerationJobContext.Provider value={value}>{children}</GenerationJobContext.Provider>;
}
