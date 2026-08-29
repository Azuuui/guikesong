import {ArrowRight, ImageSquare, Plus} from '@phosphor-icons/react';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {TEMPLATE_CONFIGS_BY_ID} from '../config/templates';
import {TemplateGallery} from '../features/templates/TemplateGallery';
import {historyRepository} from '../features/history/historyRepository';
import {formatHistoryTime} from '../features/history/time';
import type {HistoryRecord} from '../features/history/historyTypes';

type DashboardState =
  | {status: 'loading'; records: []}
  | {status: 'ready'; records: HistoryRecord[]}
  | {status: 'error'; records: []};

function RecentTaskSkeleton() {
  return (
    <div aria-label="正在读取最近任务" className="recent-task-list recent-task-list--loading" role="status">
      {Array.from({length: 3}, (_, index) => (
        <div className="recent-task recent-task--skeleton" key={index}>
          <span className="skeleton recent-task__thumbnail" />
          <span className="recent-task__body">
            <span className="skeleton skeleton--title" />
            <span className="skeleton skeleton--meta" />
          </span>
          <span className="skeleton skeleton--status" />
        </div>
      ))}
    </div>
  );
}

function firstStoredThumbnail(record: HistoryRecord): Blob | undefined {
  const blobsByPageId = new Map(record.pageBlobs.map(page => [page.pageId, page.blob]));
  const firstSuccessfulPage = record.response.pages.find(
    page => page.status === 'succeeded' && blobsByPageId.has(page.id),
  );
  return firstSuccessfulPage ? blobsByPageId.get(firstSuccessfulPage.id) : undefined;
}

function RecentTaskList({records, thumbnailUrls}: {
  records: HistoryRecord[];
  thumbnailUrls: ReadonlyMap<string, string>;
}) {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  return (
    <div className="recent-task-list">
      {records.map(record => {
        const template = TEMPLATE_CONFIGS_BY_ID.get(record.templateId);
        const successfulPages = record.response.pages.filter(page => page.status === 'succeeded').length;
        const totalPages = record.response.pages.length;
        const thumbnailUrl = thumbnailUrls.get(record.id);
        const showThumbnail = thumbnailUrl && !failedImages.has(record.id);
        const statusLabel = record.response.status === 'succeeded' ? '已完成' : '部分完成';

        return (
          <Link className="recent-task" key={record.id} to={`/history/${record.id}`}>
            <span className="recent-task__thumbnail">
              {showThumbnail ? (
                <img
                  alt={`${record.response.copy.title || template?.name || '生成任务'}缩略图`}
                  onError={() => setFailedImages(current => new Set(current).add(record.id))}
                  src={thumbnailUrl}
                />
              ) : (
                <span aria-label="任务缩略图暂不可用" className="recent-task__thumbnail-placeholder" role="img">
                  <ImageSquare aria-hidden="true" size={22} />
                </span>
              )}
            </span>
            <span className="recent-task__body">
              <strong>{record.response.copy.title || record.userPrompt}</strong>
              <span>{template?.name ?? '文旅素材'}　{formatHistoryTime(record.createdAt)}</span>
            </span>
            <span className={`recent-task__status recent-task__status--${record.response.status}`}>
              <strong>{statusLabel}</strong>
              <span>{successfulPages}/{totalPages} 页成功</span>
            </span>
            <ArrowRight aria-hidden="true" className="recent-task__arrow" size={18} weight="bold" />
          </Link>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const [state, setState] = useState<DashboardState>({status: 'loading', records: []});
  const [thumbnailUrls, setThumbnailUrls] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];

    historyRepository.list().then(records => {
      if (!active) return;
      const recentRecords = records.slice(0, 8);
      const nextThumbnailUrls = new Map<string, string>();

      recentRecords.forEach(record => {
        const blob = firstStoredThumbnail(record);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        createdUrls.push(url);
        nextThumbnailUrls.set(record.id, url);
      });

      setThumbnailUrls(nextThumbnailUrls);
      setState({status: 'ready', records: recentRecords});
    }).catch(() => {
      if (active) setState({status: 'error', records: []});
    });

    return () => {
      active = false;
      createdUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const hasRecords = state.status === 'ready' && state.records.length > 0;

  return (
    <section aria-labelledby="dashboard-title" className="dashboard-page">
      <header className="page-header">
        <div>
          <h1 id="dashboard-title">工作台</h1>
          <p>从最近任务继续工作，或选择模板创建新的文旅营销素材。</p>
        </div>
        <Link className="button dashboard-page__primary-action" to="/templates">
          <Plus aria-hidden="true" size={18} weight="bold" />
          <span>创建新素材</span>
        </Link>
      </header>

      {state.status === 'loading' ? (
        <section aria-labelledby="recent-tasks-loading-title" className="dashboard-empty">
          <div className="dashboard-empty__copy">
            <h2 id="recent-tasks-loading-title">正在读取最近任务</h2>
            <p>正在整理保存在当前浏览器中的创作记录。</p>
          </div>
          <RecentTaskSkeleton />
        </section>
      ) : hasRecords ? (
        <div className="dashboard-layout">
          <section aria-labelledby="recent-tasks-title" className="dashboard-recent">
            <div className="section-heading">
              <h2 id="recent-tasks-title">继续最近的创作</h2>
              <Link aria-label="查看全部本机历史记录" to="/history">查看全部历史</Link>
            </div>
            <RecentTaskList records={state.records} thumbnailUrls={thumbnailUrls} />
          </section>

          <aside aria-labelledby="quick-templates-title" className="dashboard-templates">
            <div className="section-heading">
              <h2 id="quick-templates-title">模板快捷入口</h2>
            </div>
            <TemplateGallery compact headingLevel={3} />
          </aside>
        </div>
      ) : state.status === 'error' ? (
        <section aria-labelledby="recent-tasks-error-title" className="dashboard-empty">
          <div className="dashboard-empty__copy">
            <h2 id="recent-tasks-error-title">暂时无法读取最近任务</h2>
            <p role="status">你仍可以选择模板创建新素材。</p>
          </div>
          <TemplateGallery headingLevel={3} />
        </section>
      ) : (
        <section aria-labelledby="first-creation-title" className="dashboard-empty">
          <div className="dashboard-empty__copy">
            <h2 id="first-creation-title">开始创建第一套文旅素材</h2>
            <p>选择一个模板，输入一句话需求，系统会生成文案、标签和完整图片页面。</p>
          </div>
          <TemplateGallery headingLevel={3} />
        </section>
      )}
    </section>
  );
}
