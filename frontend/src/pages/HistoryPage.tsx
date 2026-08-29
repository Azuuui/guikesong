import {ArrowClockwise, DotsThree, ImageSquare, Plus, Trash} from '@phosphor-icons/react';
import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Button} from '../components/Button';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {EmptyState} from '../components/EmptyState';
import {StatusBadge} from '../components/StatusBadge';
import {TEMPLATE_CONFIGS_BY_ID} from '../config/templates';
import {useGenerationJob} from '../features/generation/GenerationJobProvider';
import {GENERATION_JOB_PHASE_LABELS} from '../features/home/HomeGenerationStatus';
import {historyRepository} from '../features/history/historyRepository';
import {buildRegenerationState} from '../features/history/historyTypes';
import {formatHistoryTime} from '../features/history/time';
import type {HistoryRecord} from '../features/history/historyTypes';
import type {GenerationJobSnapshot} from '../../../shared/generationJobs';

type HistoryState =
  | {status: 'loading'; records: []}
  | {status: 'ready'; records: HistoryRecord[]}
  | {status: 'cleared'; records: []}
  | {status: 'error'; records: []};

type HistoryGroup = {
  label: '今天' | '昨天' | '更早';
  records: HistoryRecord[];
};

function isTerminalStatus(status: GenerationJobSnapshot['status']): boolean {
  return status === 'succeeded' || status === 'partial' || status === 'failed';
}

/** 历史页顶部的进行中任务摘要：跨页面轮询期间也能在本页看到阶段。 */
function HistoryJobSummary() {
  const {activeJob, openResult} = useGenerationJob();
  if (!activeJob) return null;

  const terminal = isTerminalStatus(activeJob.status);
  const text = terminal
    ? activeJob.status === 'failed'
      ? activeJob.error?.message ?? '素材生成失败，请稍后重试。'
      : activeJob.status === 'partial'
        ? '部分素材已完成'
        : '素材已生成'
    : activeJob.phase === 'images' && activeJob.totalImages > 0
      ? `正在生成图片 ${Math.min(activeJob.completedImages + 1, activeJob.totalImages)}/${activeJob.totalImages}`
      : GENERATION_JOB_PHASE_LABELS[activeJob.phase];

  return (
    <div
      className={`history-job-summary history-job-summary--${terminal ? 'terminal' : 'running'}`}
      data-testid="history-job-summary"
      role="status"
    >
      <span aria-hidden="true" className="history-job-summary__dot" />
      <p className="history-job-summary__text">{text}</p>
      {terminal && activeJob.result ? (
        <Button onClick={() => void openResult()} variant="ghost">查看结果</Button>
      ) : null}
    </div>
  );
}

function firstStoredThumbnail(record: HistoryRecord): Blob | undefined {
  const blobsByPageId = new Map(record.pageBlobs.map(page => [page.pageId, page.blob]));
  const page = record.result.pages.find(item => item.status === 'succeeded' && blobsByPageId.has(item.id));
  return page ? blobsByPageId.get(page.id) : undefined;
}

function recordTitle(record: HistoryRecord): string {
  const title = record.result.workflowId === 'original-ip'
    ? record.result.copy.title
    : record.result.copy.titles[0] ?? '';
  return title.trim() || record.userPrompt.trim() || '未命名生成结果';
}

function newestFirst(left: HistoryRecord, right: HistoryRecord): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function recentRecords(records: HistoryRecord[]): HistoryRecord[] {
  return [...records].sort(newestFirst).slice(0, 20);
}

function historyGroups(records: HistoryRecord[]): HistoryGroup[] {
  const groups: HistoryGroup[] = [
    {label: '今天', records: []},
    {label: '昨天', records: []},
    {label: '更早', records: []},
  ];

  records.forEach(record => {
    const formattedTime = formatHistoryTime(record.createdAt);
    const group = formattedTime.startsWith('今天 ')
      ? groups[0]
      : formattedTime.startsWith('昨天 ')
        ? groups[1]
        : groups[2];
    group.records.push(record);
  });

  return groups.filter(group => group.records.length > 0);
}

function HistorySkeleton() {
  return (
    <div aria-label="正在读取本机历史" className="history-list history-list--loading" role="status">
      {Array.from({length: 4}, (_, index) => (
        <div className="history-row history-row--skeleton" key={index}>
          <span className="history-row__thumbnail skeleton" />
          <span className="history-row__body">
            <span className="skeleton skeleton--title" />
            <span className="skeleton skeleton--meta" />
          </span>
          <span className="skeleton skeleton--status" />
        </div>
      ))}
    </div>
  );
}

function HistoryRow({
  record,
  thumbnailUrl,
  onDelete,
}: {
  record: HistoryRecord;
  thumbnailUrl?: string;
  onDelete: (record: HistoryRecord) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const template = TEMPLATE_CONFIGS_BY_ID.get(record.workflowId);
  const successfulCount = record.result.pages.filter(page => page.status === 'succeeded').length;
  const totalCount = record.result.pages.length;
  const completed = record.result.status === 'succeeded';

  async function deleteRecord() {
    setDeleteError('');
    try {
      await onDelete(record);
    } catch {
      setDeleteError('删除失败，请稍后重试。');
      throw new Error('删除本机历史失败');
    }
  }

  return (
    <article className="history-row">
      <span className="history-row__thumbnail">
        {thumbnailUrl && !imageUnavailable ? (
          <img alt={`${recordTitle(record)}缩略图`} onError={() => setImageUnavailable(true)} src={thumbnailUrl} />
        ) : (
          <span aria-label="任务缩略图暂不可用" className="history-row__thumbnail-placeholder" role="img">
            <ImageSquare aria-hidden="true" size={22} />
          </span>
        )}
      </span>
      <div className="history-row__body">
        <strong title={recordTitle(record)}>{recordTitle(record)}</strong>
        <span>{template?.name ?? '文旅素材'}</span>
        <time dateTime={record.createdAt}>{formatHistoryTime(record.createdAt)}</time>
      </div>
      <div className="history-row__status">
        <StatusBadge tone={completed ? 'success' : 'warning'}>{completed ? '已完成' : '部分完成'}</StatusBadge>
        <span>{successfulCount}/{totalCount} 页成功</span>
      </div>
      <Link className="history-row__view" to={`/history/${record.id}`}>查看结果</Link>
      <details className="history-row__menu">
        <summary aria-label={`${recordTitle(record)}的更多操作`}>
          <DotsThree aria-hidden="true" size={22} weight="bold" />
        </summary>
        <div className="history-row__menu-content">
          <Button
            onClick={() => navigate(`/templates/${record.workflowId}/create`, {
              state: buildRegenerationState(record),
            })}
            variant="ghost"
          >
            <ArrowClockwise aria-hidden="true" size={17} weight="bold" />
            重新生成
          </Button>
          <ConfirmDialog
            confirmLabel="删除本机记录"
            description="这条记录将从当前浏览器中删除。后端保存的参考图不会被删除。"
            onConfirm={deleteRecord}
            title="删除这条本机历史？"
            triggerLabel="删除本机记录"
            triggerVariant="ghost"
          />
        </div>
      </details>
      {deleteError ? <p className="history-row__error" role="alert">{deleteError}</p> : null}
    </article>
  );
}

export function HistoryPage() {
  const [state, setState] = useState<HistoryState>({status: 'loading', records: []});
  const [thumbnailUrls, setThumbnailUrls] = useState<ReadonlyMap<string, string>>(new Map());
  const [clearError, setClearError] = useState('');

  useEffect(() => {
    let active = true;

    historyRepository.list().then(records => {
    if (active) setState({status: 'ready', records: recentRecords(records)});
    }).catch(() => {
      if (active) setState({status: 'error', records: []});
    });

    return () => {
      active = false;
    };
  }, []);

  const records = state.records;

  useEffect(() => {
    const createdUrls: string[] = [];
    const nextThumbnailUrls = new Map<string, string>();

    records.forEach(record => {
      const thumbnail = firstStoredThumbnail(record);
      if (!thumbnail) return;
      const url = URL.createObjectURL(thumbnail);
      createdUrls.push(url);
      nextThumbnailUrls.set(record.id, url);
    });

    setThumbnailUrls(nextThumbnailUrls);
    return () => createdUrls.forEach(url => URL.revokeObjectURL(url));
  }, [records]);

  const groups = useMemo(() => historyGroups(records), [records]);

  async function deleteRecord(record: HistoryRecord) {
    await historyRepository.delete(record.id);
    setState(current => current.status === 'ready'
      ? {status: 'ready', records: current.records.filter(item => item.id !== record.id)}
      : current);
  }

  async function clearHistory() {
    setClearError('');
    try {
      await historyRepository.clear();
      setState({status: 'cleared', records: []});
    } catch {
      try {
        const remaining = await historyRepository.list();
        setState({status: 'ready', records: recentRecords(remaining)});
        setClearError(`清空失败，当前仍有 ${remaining.length} 条本机记录。`);
      } catch {
        setClearError('清空失败，请稍后重试。');
      }
      throw new Error('清空本机历史失败');
    }
  }

  return (
    <section aria-labelledby="history-page-title" className="history-page">
      <header className="page-header history-page__header">
        <div>
          <h1 id="history-page-title">本机历史</h1>
          <p>记录保存在当前浏览器中</p>
          {state.status === 'ready' ? <span className="history-page__count">已保存 {records.length}/20 条</span> : null}
        </div>
        {records.length > 0 ? (
          <ConfirmDialog
            confirmLabel="清空本机历史"
            description={`将清空当前浏览器中的 ${records.length} 条本机记录。已下载的文件和后端保存的参考图不会被删除。`}
            onConfirm={clearHistory}
            title="清空本机历史？"
            triggerLabel="清空本机历史"
            triggerVariant="danger"
          />
        ) : null}
      </header>

      <HistoryJobSummary />

      {clearError ? <p className="history-page__error" role="alert">{clearError}</p> : null}
      {state.status === 'loading' ? <HistorySkeleton /> : null}
      {state.status === 'error' ? (
        <EmptyState
          action={<Link className="button" to="/templates"><Plus aria-hidden="true" size={18} weight="bold" />创建新素材</Link>}
          description="本机历史暂时无法读取，但不影响你继续创建新素材。"
          title="暂时无法读取本机历史"
        />
      ) : null}
      {state.status === 'cleared' ? (
        <EmptyState
          action={<Link className="button" to="/templates"><Plus aria-hidden="true" size={18} weight="bold" />创建新素材</Link>}
          description="本机历史已经清空"
          icon={<Trash size={28} weight="duotone" />}
          title="本机历史已经清空"
        />
      ) : null}
      {state.status === 'ready' && records.length === 0 ? (
        <EmptyState
          action={<Link className="button" to="/templates"><Plus aria-hidden="true" size={18} weight="bold" />创建新素材</Link>}
          description="完成第一套素材后，记录会自动保存在这里。"
          title="还没有生成记录"
        />
      ) : null}
      {state.status === 'ready' && records.length > 0 ? (
        <div className="history-groups">
          {groups.map(group => (
            <section aria-labelledby={`history-group-${group.label}`} className="history-group" key={group.label}>
              <h2 id={`history-group-${group.label}`}>{group.label}</h2>
              <div className="history-list">
                {group.records.map(record => (
                  <HistoryRow
                    key={record.id}
                    onDelete={deleteRecord}
                    record={record}
                    thumbnailUrl={thumbnailUrls.get(record.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
