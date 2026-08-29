import {
  ArrowClockwise,
  ArrowLeft,
  Copy,
  DownloadSimple,
  ImageSquare,
  MagnifyingGlassPlus,
  WarningCircle,
} from '@phosphor-icons/react';
import {useEffect, useMemo, useRef, useState, type MouseEvent} from 'react';
import type {GenerateResponse, GeneratedPage} from '../../../../shared/types';
import {Link} from 'react-router-dom';
import {Button} from '../../components/Button';
import {StatusBadge} from '../../components/StatusBadge';
import {TEMPLATE_CONFIGS_BY_ID} from '../../config/templates';
import {copyText, DownloadError, downloadPackage, downloadPage} from '../generation/downloads';
import {formatHistoryTime} from '../history/time';
import {ImagePreviewDialog} from './ImagePreviewDialog';

export type ResultDetailProps = {
  response: GenerateResponse;
  createdAt: string;
  userPrompt: string;
  source: 'current' | 'history';
  historySaveWarning?: string;
  onRegenerate: () => void;
};

type CopyTarget = 'title' | 'body' | 'tags';
type Feedback = {target: CopyTarget | 'page' | 'package'; message: string; kind: 'success' | 'error'} | undefined;

const PAGE_TYPE_LABELS: Record<GeneratedPage['pageType'], string> = {
  cover: '封面',
  content: '内容页',
  ending: '结尾页',
};

function fallbackTitle(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= 30) return trimmed || '未命名生成结果';
  return `${trimmed.slice(0, 30)}…`;
}

function firstSelectedPageId(pages: readonly GeneratedPage[]): string | undefined {
  return pages.find(page => page.status === 'succeeded')?.id ?? pages[0]?.id;
}

function StatusSummary({response}: {response: GenerateResponse}) {
  const successfulCount = response.pages.filter(page => page.status === 'succeeded').length;
  if (response.status === 'succeeded') {
    return <StatusBadge tone="success">已完成</StatusBadge>;
  }
  return <StatusBadge tone="warning">部分完成 {successfulCount}/{response.pages.length}</StatusBadge>;
}

export function ResultDetail({
  response,
  createdAt,
  userPrompt,
  source,
  historySaveWarning,
  onRegenerate,
}: ResultDetailProps) {
  const template = TEMPLATE_CONFIGS_BY_ID.get(response.templateId);
  const [selectedPageId, setSelectedPageId] = useState(() => firstSelectedPageId(response.pages));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [unavailableImageIds, setUnavailableImageIds] = useState<Set<string>>(() => new Set());
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const previewTriggerRef = useRef<HTMLElement>(null);
  const selectedPage = response.pages.find(page => page.id === selectedPageId) ?? response.pages[0];
  const successfulCount = useMemo(
    () => response.pages.filter(page => page.status === 'succeeded').length,
    [response.pages],
  );
  const failedCount = response.pages.length - successfulCount;
  const title = response.copy.title.trim() || fallbackTitle(userPrompt);

  // 结果切换时重置本地状态：渲染期调整状态，避免级联渲染
  const [lastRequestId, setLastRequestId] = useState(response.requestId);
  if (lastRequestId !== response.requestId) {
    setLastRequestId(response.requestId);
    setSelectedPageId(firstSelectedPageId(response.pages));
    setPreviewOpen(false);
    setUnavailableImageIds(new Set());
  }

  useEffect(() => () => {
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  function showFeedback(nextFeedback: NonNullable<Feedback>) {
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
    setFeedback(nextFeedback);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(undefined), 1800);
  }

  async function handleCopy(target: CopyTarget, value: string) {
    const result = await copyText(value);
    showFeedback(result.ok
      ? {target, kind: 'success', message: '已复制'}
      : {target, kind: 'error', message: result.message});
  }

  async function handleDownloadPage(page: GeneratedPage) {
    try {
      await downloadPage(page);
      showFeedback({target: 'page', kind: 'success', message: '已开始下载'});
    } catch (error) {
      const message = error instanceof DownloadError ? error.message : '图片下载失败，请稍后重试';
      showFeedback({target: 'page', kind: 'error', message});
    }
  }

  async function handleDownloadPackage() {
    try {
      await downloadPackage(response);
      showFeedback({target: 'package', kind: 'success', message: '已开始下载'});
    } catch (error) {
      const message = error instanceof DownloadError ? error.message : '素材包下载失败，请稍后重试';
      showFeedback({target: 'package', kind: 'error', message});
    }
  }

  function openPreview(event: MouseEvent<HTMLElement>) {
    if (!selectedPage || selectedPage.status !== 'succeeded' || !selectedPage.imageUrl) return;
    previewTriggerRef.current = event.currentTarget;
    setPreviewOpen(true);
  }

  const copyAction = (target: CopyTarget, label: string, value: string) => (
    <div className="result-detail__copy-action">
      <Button aria-label={`复制${label}`} onClick={() => void handleCopy(target, value)} variant="ghost">
        <Copy aria-hidden="true" size={17} weight="bold" />
        复制
      </Button>
      {feedback?.target === target ? (
        <span className={`result-detail__feedback result-detail__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</span>
      ) : null}
    </div>
  );

  return (
    <section aria-labelledby="result-detail-title" className="result-detail">
      <nav aria-label="面包屑" className="result-detail__breadcrumb">
        <a href="#result-detail-title">生成结果</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{source === 'history' ? '历史详情' : '本次生成'}</span>
      </nav>
      <header className="result-detail__header">
        <div>
          <p className="result-detail__eyebrow">{template?.name ?? '文旅营销素材'} · {formatHistoryTime(createdAt)}</p>
          <div className="result-detail__title-row">
            <h1 id="result-detail-title">{title}</h1>
            <StatusSummary response={response} />
          </div>
          {historySaveWarning ? <p className="result-detail__history-warning" role="alert">{historySaveWarning}</p> : null}
        </div>
        <div className="result-detail__actions">
          <div>
            <Button onClick={() => void handleDownloadPackage()}>
              <DownloadSimple aria-hidden="true" size={18} weight="bold" />
              下载素材包
            </Button>
            {feedback?.target === 'package' ? <span className={`result-detail__feedback result-detail__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</span> : null}
          </div>
          <Button onClick={onRegenerate} variant="secondary">
            <ArrowClockwise aria-hidden="true" size={18} weight="bold" />
            重新生成
          </Button>
          <Link className="button button--ghost" to="/">
            <ArrowLeft aria-hidden="true" size={18} weight="bold" />
            返回工作台
          </Link>
          <p className="result-detail__regenerate-help">重新生成会创建新的结果，不会覆盖已有历史。</p>
        </div>
      </header>

      {response.status === 'partial' ? (
        <aside className="result-detail__partial-notice" role="status">
          <WarningCircle aria-hidden="true" size={20} weight="bold" />
          <div>
            <strong>部分页面未生成成功</strong>
            <p>{successfulCount} 页成功，{failedCount} 页未生成成功。素材包只含成功图和完整文案。</p>
          </div>
        </aside>
      ) : null}

      <div className="result-detail__layout">
        <aside aria-label="页面缩略图" className="result-detail__thumbnails">
          {response.pages.map((page, index) => {
            const selected = page.id === selectedPage?.id;
            return (
              <button
                aria-label={`${PAGE_TYPE_LABELS[page.pageType]} ${index + 1}${page.status === 'failed' ? '，未生成成功' : ''}`}
                aria-pressed={selected}
                className={`result-thumbnail${selected ? ' result-thumbnail--selected' : ''}${page.status === 'failed' ? ' result-thumbnail--failed' : ''}`}
                key={page.id}
                onClick={() => setSelectedPageId(page.id)}
                type="button"
              >
                <span className="result-thumbnail__image">
                  {page.status === 'succeeded' && page.imageUrl && !unavailableImageIds.has(page.id) ? (
                    <img alt="" onError={() => setUnavailableImageIds(current => new Set(current).add(page.id))} src={page.imageUrl} />
                  ) : (
                    <ImageSquare aria-hidden="true" size={22} />
                  )}
                </span>
                <span className="result-thumbnail__label">{PAGE_TYPE_LABELS[page.pageType]} {index + 1}</span>
              </button>
            );
          })}
        </aside>

        <section aria-label="页面预览" className="result-detail__preview">
          {selectedPage?.status === 'succeeded' && selectedPage.imageUrl && !unavailableImageIds.has(selectedPage.id) ? (
            <>
              <button aria-label="打开大图预览" className="result-detail__preview-image" onClick={openPreview} type="button">
                <img alt={selectedPage.alt || `${PAGE_TYPE_LABELS[selectedPage.pageType]}预览`} onError={() => setUnavailableImageIds(current => new Set(current).add(selectedPage.id))} src={selectedPage.imageUrl} />
              </button>
              <div className="result-detail__preview-actions">
                <Button onClick={openPreview} variant="secondary">
                  <MagnifyingGlassPlus aria-hidden="true" size={18} weight="bold" />
                  查看大图
                </Button>
                <div>
                  <Button onClick={() => void handleDownloadPage(selectedPage)} variant="secondary">
                    <DownloadSimple aria-hidden="true" size={18} weight="bold" />
                    下载此页
                  </Button>
                  {feedback?.target === 'page' ? <span className={`result-detail__feedback result-detail__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</span> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="result-detail__failed-preview">
              <ImageSquare aria-hidden="true" size={36} />
              <strong>该页面暂时未生成成功。</strong>
              <p>重新生成整套素材可获得新的页面结果。</p>
              <Button onClick={onRegenerate} variant="secondary">
                <ArrowClockwise aria-hidden="true" size={18} weight="bold" />
                重新生成整套素材
              </Button>
            </div>
          )}
        </section>

        <aside aria-label="生成文案" className="result-detail__copy">
          <section>
            <div className="result-detail__copy-heading">
              <h2>标题</h2>
              {copyAction('title', '标题', response.copy.title.trim() || title)}
            </div>
            <p className="result-detail__copy-title">{title}</p>
          </section>
          <section>
            <div className="result-detail__copy-heading">
              <h2>正文</h2>
              {copyAction('body', '正文', response.copy.body)}
            </div>
            <p className="result-detail__copy-body">{response.copy.body}</p>
          </section>
          <section>
            <div className="result-detail__copy-heading">
              <h2>标签</h2>
              {copyAction('tags', '标签', response.copy.tags.join(' '))}
            </div>
            <div className="result-detail__tags">
              {response.copy.tags.map((tag, index) => <span className="result-detail__tag" key={`${tag}-${index}`}>{tag}</span>)}
            </div>
          </section>
        </aside>
      </div>

      <ImagePreviewDialog
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onImageUnavailable={pageId => setUnavailableImageIds(current => new Set(current).add(pageId))}
        onSelectPage={setSelectedPageId}
        pages={response.pages}
        returnFocusRef={previewTriggerRef}
        selectedPageId={selectedPageId}
      />
    </section>
  );
}
