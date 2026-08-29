import {ArrowLeft, ArrowRight, DownloadSimple, X} from '@phosphor-icons/react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {RefObject} from 'react';
import type {GeneratedPage} from '../../../../shared/types';
import {Button} from '../../components/Button';
import {DownloadError, downloadPage} from '../generation/downloads';

type ImagePreviewDialogProps = {
  isOpen: boolean;
  pages: readonly GeneratedPage[];
  selectedPageId: string | undefined;
  onClose: () => void;
  onImageUnavailable: (pageId: string) => void;
  onSelectPage: (pageId: string) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
};

const PAGE_TYPE_LABELS: Record<GeneratedPage['pageType'], string> = {
  cover: '封面',
  content: '内容页',
  ending: '结尾页',
};

function canHandleArrowKey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  const tagName = target.tagName;
  return tagName !== 'INPUT'
    && tagName !== 'TEXTAREA'
    && tagName !== 'SELECT'
    && !target.isContentEditable;
}

export function ImagePreviewDialog({
  isOpen,
  pages,
  selectedPageId,
  onClose,
  onImageUnavailable,
  onSelectPage,
  returnFocusRef,
}: ImagePreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(false);
  const downloadRunRef = useRef(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<{kind: 'success' | 'error'; message: string}>();
  const previewPages = useMemo(
    () => pages.filter(page => page.status === 'succeeded' && Boolean(page.imageUrl)),
    [pages],
  );
  const selectedIndex = Math.max(0, previewPages.findIndex(page => page.id === selectedPageId));
  const selectedPage = previewPages[selectedIndex];
  const originalPosition = selectedPage ? pages.findIndex(page => page.id === selectedPage.id) + 1 : 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    isOpenRef.current = isOpen;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      queueMicrotask(() => closeButtonRef.current?.focus());
    }
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isOpenRef.current = false;
      downloadRunRef.current += 1;
      if (dialogRef.current?.open) dialogRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    downloadRunRef.current += 1;
    setIsDownloading(false);
    setDownloadFeedback(undefined);
  }, [isOpen, selectedPage?.id]);

  useEffect(() => {
    if (!isOpen || previewPages.length < 2) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!canHandleArrowKey(event.target)) return;
      if (event.key === 'ArrowLeft' && selectedIndex > 0) {
        event.preventDefault();
        onSelectPage(previewPages[selectedIndex - 1].id);
      }
      if (event.key === 'ArrowRight' && selectedIndex < previewPages.length - 1) {
        event.preventDefault();
        onSelectPage(previewPages[selectedIndex + 1].id);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onSelectPage, previewPages, selectedIndex]);

  function handleClose() {
    if (!isMountedRef.current) return;
    isOpenRef.current = false;
    downloadRunRef.current += 1;
    onClose();
    queueMicrotask(() => returnFocusRef.current?.focus());
  }

  async function handleDownload() {
    if (isDownloading || !selectedPage) return;
    const run = downloadRunRef.current + 1;
    downloadRunRef.current = run;
    setIsDownloading(true);
    setDownloadFeedback(undefined);

    try {
      await downloadPage(selectedPage);
      if (isMountedRef.current && isOpenRef.current && downloadRunRef.current === run) {
        setDownloadFeedback({kind: 'success', message: '已开始下载'});
      }
    } catch (error) {
      if (isMountedRef.current && isOpenRef.current && downloadRunRef.current === run) {
        setDownloadFeedback({
          kind: 'error',
          message: error instanceof DownloadError ? error.message : '图片下载失败，请稍后重试',
        });
      }
    } finally {
      if (isMountedRef.current && isOpenRef.current && downloadRunRef.current === run) {
        setIsDownloading(false);
      }
    }
  }

  if (!selectedPage) return null;

  return (
    <dialog
      aria-label="图片沉浸预览"
      className="image-preview-dialog"
      onClose={handleClose}
      ref={dialogRef}
    >
      <div className="image-preview-dialog__topbar">
        <p>{PAGE_TYPE_LABELS[selectedPage.pageType]} {originalPosition} / {pages.length}</p>
        <Button aria-label="关闭大图预览" className="image-preview-dialog__close" onClick={() => dialogRef.current?.close()} ref={closeButtonRef} variant="ghost">
          <X aria-hidden="true" size={22} weight="bold" />
        </Button>
      </div>
      <div className="image-preview-dialog__image-wrap">
        <img
          alt={selectedPage.alt || `${PAGE_TYPE_LABELS[selectedPage.pageType]}预览`}
          onError={() => {
            onImageUnavailable(selectedPage.id);
            dialogRef.current?.close();
          }}
          src={selectedPage.imageUrl}
        />
      </div>
      <div className="image-preview-dialog__footer">
        <div className="image-preview-dialog__navigation" aria-label="切换预览页">
          <Button
            aria-label="查看上一张"
            disabled={selectedIndex === 0}
            onClick={() => onSelectPage(previewPages[selectedIndex - 1].id)}
            variant="secondary"
          >
            <ArrowLeft aria-hidden="true" size={18} weight="bold" />
            上一张
          </Button>
          <Button
            aria-label="查看下一张"
            disabled={selectedIndex === previewPages.length - 1}
            onClick={() => onSelectPage(previewPages[selectedIndex + 1].id)}
            variant="secondary"
          >
            下一张
            <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </Button>
        </div>
        <div className="image-preview-dialog__download">
          <Button loading={isDownloading} loadingLabel="正在下载" onClick={() => void handleDownload()}>
            <DownloadSimple aria-hidden="true" size={18} weight="bold" />
            下载此页
          </Button>
          {downloadFeedback ? (
            <p
              aria-live="polite"
              className={`image-preview-dialog__download-feedback image-preview-dialog__download-feedback--${downloadFeedback.kind}`}
              role={downloadFeedback.kind === 'error' ? 'alert' : 'status'}
            >
              {downloadFeedback.message}
            </p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
