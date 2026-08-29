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
import type {
  GenerateResult,
  OriginalIpPageRole,
  TravelGuidePageRole,
  UgcPhotoCampaignPageRole,
  WorkflowPageBase,
  XhsAtlasPageRole,
} from '../../../../shared/types';
import {Link} from 'react-router-dom';
import {Button} from '../../components/Button';
import {StatusBadge} from '../../components/StatusBadge';
import {TEMPLATE_CONFIGS_BY_ID} from '../../config/templates';
import {copyText, DownloadError, downloadPackage, downloadPage} from '../generation/downloads';
import {formatHistoryTime} from '../history/time';
import {ImagePreviewDialog} from './ImagePreviewDialog';
import {OriginalIpResultPanel} from './OriginalIpResult';
import {TravelGuideResultPanel} from './TravelGuideResult';
import {UgcPhotoCampaignResultPanel} from './UgcPhotoCampaignResult';
import {XhsAtlasResultPanel} from './XhsAtlasResult';

export type ResultDetailProps = {
  result: GenerateResult;
  createdAt: string;
  userPrompt: string;
  source: 'current' | 'history';
  historySaveWarning?: string;
  onRegenerate: () => void;
};

type DownloadTarget = 'page' | 'package';
type DownloadFeedback = {target: DownloadTarget; message: string; kind: 'success' | 'error'} | undefined;

const PAGE_ROLE_LABELS: Record<
  OriginalIpPageRole | XhsAtlasPageRole | TravelGuidePageRole | UgcPhotoCampaignPageRole,
  string
> = {
  'brand-cover': '品牌主视觉',
  'identity-system': '识别系统',
  'product-system': '商品包装',
  'scene-application': '场景应用',
  overview: '总览图',
  cover: '封面',
  content: '正文页',
  route: '路线页',
  transport: '交通页',
  stay: '住宿页',
  food: '美食页',
  poster: '海报',
};

function fallbackTitle(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= 30) return trimmed || '未命名生成结果';
  return `${trimmed.slice(0, 30)}…`;
}

/** 原创 IP 取唯一标题；其余工作流取首个候选标题，缺省时回退用户输入。 */
function resultTitle(result: GenerateResult, userPrompt: string): string {
  if (result.workflowId === 'original-ip') {
    return result.copy.title.trim() || fallbackTitle(userPrompt);
  }
  return result.copy.titles[0]?.trim() || fallbackTitle(userPrompt);
}

/** 图鉴与攻略优先选中封面；否则选中第一张成功页。 */
function firstSelectedPageId(result: GenerateResult): string | undefined {
  if (result.workflowId === 'xhs-atlas' || result.workflowId === 'travel-guide') {
    const cover = result.pages.find(page => page.role === 'cover');
    if (cover) return cover.id;
  }
  return result.pages.find(page => page.status === 'succeeded')?.id ?? result.pages[0]?.id;
}

type AnyResultPage = GenerateResult['pages'][number];

/** 缩略图标签：路线页带天数，其余按页型 + 序号。 */
function pageLabel(page: AnyResultPage, index: number): string {
  if (page.role === 'route' && typeof page.day === 'number') {
    return `第${page.day}天路线`;
  }
  return `${PAGE_ROLE_LABELS[page.role]} ${index + 1}`;
}

/** 复制按钮：自带成功/失败反馈，工作流文案面板复用。 */
export function CopyButton({label, value}: {label: string; value: string}) {
  const [feedback, setFeedback] = useState<{kind: 'success' | 'error'; message: string}>();
  const feedbackTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  async function handleCopy() {
    const copyResult = await copyText(value);
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
    setFeedback(copyResult.ok
      ? {kind: 'success', message: '已复制'}
      : {kind: 'error', message: copyResult.message});
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(undefined), 1800);
  }

  return (
    <div className="result-detail__copy-action">
      <Button aria-label={`复制${label}`} onClick={() => void handleCopy()} variant="ghost">
        <Copy aria-hidden="true" size={17} weight="bold" />
        复制
      </Button>
      {feedback ? (
        <span
          className={`result-detail__feedback result-detail__feedback--${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}

function StatusSummary({result}: {result: GenerateResult}) {
  const successfulCount = result.pages.filter(page => page.status === 'succeeded').length;
  if (result.status === 'succeeded') {
    return <StatusBadge tone="success">已完成</StatusBadge>;
  }
  return <StatusBadge tone="warning">部分完成 {successfulCount}/{result.pages.length}</StatusBadge>;
}

export function ResultDetail({
  result,
  createdAt,
  userPrompt,
  source,
  historySaveWarning,
  onRegenerate,
}: ResultDetailProps) {
  const template = TEMPLATE_CONFIGS_BY_ID.get(result.workflowId);
  const [selectedPageId, setSelectedPageId] = useState(() => firstSelectedPageId(result));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [feedback, setFeedback] = useState<DownloadFeedback>();
  const [unavailableImageIds, setUnavailableImageIds] = useState<Set<string>>(() => new Set());
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const previewTriggerRef = useRef<HTMLElement>(null);
  const selectedPage = result.pages.find(page => page.id === selectedPageId) ?? result.pages[0];
  const successfulCount = useMemo(
    () => result.pages.filter(page => page.status === 'succeeded').length,
    [result.pages],
  );
  const failedCount = result.pages.length - successfulCount;
  const title = resultTitle(result, userPrompt);

  // 结果切换时重置本地状态：渲染期调整状态，避免级联渲染
  const [lastRequestId, setLastRequestId] = useState(result.requestId);
  if (lastRequestId !== result.requestId) {
    setLastRequestId(result.requestId);
    setSelectedPageId(firstSelectedPageId(result));
    setPreviewOpen(false);
    setUnavailableImageIds(new Set());
  }

  useEffect(() => () => {
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  function showFeedback(nextFeedback: NonNullable<DownloadFeedback>) {
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
    setFeedback(nextFeedback);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(undefined), 1800);
  }

  async function handleDownloadPage(page: WorkflowPageBase) {
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
      await downloadPackage(result);
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
            <StatusSummary result={result} />
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

      {result.status === 'partial' ? (
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
          {result.pages.map((page, index) => {
            const selected = page.id === selectedPage?.id;
            const label = pageLabel(page, index);
            return (
              <button
                aria-label={`${label}${page.status === 'failed' ? '，未生成成功' : ''}`}
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
                <span className="result-thumbnail__label">{label}</span>
              </button>
            );
          })}
        </aside>

        <section aria-label="页面预览" className="result-detail__preview">
          {selectedPage?.status === 'succeeded' && selectedPage.imageUrl && !unavailableImageIds.has(selectedPage.id) ? (
            <>
              <button aria-label="打开大图预览" className="result-detail__preview-image" onClick={openPreview} type="button">
                <img alt={selectedPage.alt || `${PAGE_ROLE_LABELS[selectedPage.role]}预览`} onError={() => setUnavailableImageIds(current => new Set(current).add(selectedPage.id))} src={selectedPage.imageUrl} />
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

        {result.workflowId === 'original-ip' ? (
          <OriginalIpResultPanel result={result} />
        ) : result.workflowId === 'xhs-atlas' ? (
          <XhsAtlasResultPanel result={result} />
        ) : result.workflowId === 'travel-guide' ? (
          <TravelGuideResultPanel result={result} />
        ) : (
          <UgcPhotoCampaignResultPanel result={result} />
        )}
      </div>

      <ImagePreviewDialog
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onImageUnavailable={pageId => setUnavailableImageIds(current => new Set(current).add(pageId))}
        onSelectPage={setSelectedPageId}
        pages={result.pages}
        returnFocusRef={previewTriggerRef}
        selectedPageId={selectedPageId}
      />
    </section>
  );
}
