import {X} from '@phosphor-icons/react';
import {useEffect, useId, useRef, useState} from 'react';
import {Button, type ButtonProps} from './Button';

type ConfirmDialogProps = {
  triggerLabel: string;
  title: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  description?: string;
  triggerVariant?: ButtonProps['variant'];
};

export function ConfirmDialog({
  triggerLabel,
  title,
  confirmLabel,
  onConfirm,
  description,
  triggerVariant = 'ghost',
}: ConfirmDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    queueMicrotask(() => cancelRef.current?.focus());
  }, [isOpen]);

  function restoreTriggerFocus() {
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function openDialog() {
    setErrorMessage('');
    setIsOpen(true);
  }

  function closeDialog() {
    if (isConfirming) return;

    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === 'function') {
      dialog.close();
    }
    setIsOpen(false);
    restoreTriggerFocus();
  }

  async function confirm() {
    setErrorMessage('');
    setIsConfirming(true);

    try {
      await onConfirm();
      const dialog = dialogRef.current;
      if (dialog?.open && typeof dialog.close === 'function') {
        dialog.close();
      }
      setIsOpen(false);
      restoreTriggerFocus();
    } catch {
      setErrorMessage('操作失败，请重试。');
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <>
      <Button ref={triggerRef} variant={triggerVariant} onClick={openDialog}>
        {triggerLabel}
      </Button>
      {isOpen ? (
        <dialog
          aria-describedby={description ? descriptionId : undefined}
          aria-labelledby={titleId}
          className="confirm-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
          onClose={() => {
            setIsOpen(false);
            restoreTriggerFocus();
          }}
          ref={dialogRef}
        >
          <div className="confirm-dialog__header">
            <h2 id={titleId}>{title}</h2>
            <Button
              aria-label="关闭"
              className="confirm-dialog__close"
              disabled={isConfirming}
              onClick={closeDialog}
              variant="ghost"
            >
              <X aria-hidden="true" size={20} weight="bold" />
            </Button>
          </div>
          {description ? <p id={descriptionId}>{description}</p> : null}
          {errorMessage ? (
            <p className="confirm-dialog__error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="confirm-dialog__actions">
            <Button disabled={isConfirming} onClick={closeDialog} ref={cancelRef} variant="secondary">
              取消
            </Button>
            <Button
              loading={isConfirming}
              loadingLabel="正在处理"
              onClick={() => void confirm()}
              variant="danger"
            >
              {confirmLabel}
            </Button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
