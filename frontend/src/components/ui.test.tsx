import {act, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {Button} from './Button';
import {ConfirmDialog} from './ConfirmDialog';

describe('UI primitives', () => {
  it('loading button keeps the action disabled and exposes its label', () => {
    render(
      <Button loading loadingLabel="正在生成素材">
        开始生成
      </Button>,
    );

    expect(screen.getByRole('button', {name: '正在生成素材'})).toBeDisabled();
  });

  it('confirm dialog returns focus to its trigger after closing', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);

    render(
      <ConfirmDialog
        triggerLabel="删除本机记录"
        title="删除这条本机历史？"
        confirmLabel="删除本机记录"
        onConfirm={onConfirm}
      />,
    );

    const trigger = screen.getByRole('button', {name: '删除本机记录'});
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    const cancelButton = within(dialog).getByRole('button', {name: '取消'});
    expect(screen.getByRole('heading', {name: '删除这条本机历史？'})).toBeVisible();
    expect(cancelButton).toHaveFocus();
    await user.click(cancelButton);

    expect(trigger).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirm dialog closes on Esc and restores focus', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        triggerLabel="清空本机历史"
        title="清空全部本机历史？"
        confirmLabel="清空本机历史"
        onConfirm={() => undefined}
      />,
    );

    const trigger = screen.getByRole('button', {name: '清空本机历史'});
    await user.click(trigger);
    await act(async () => {
      fireEvent(screen.getByRole('dialog'), new Event('cancel', {cancelable: true}));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('confirm dialog disables closing actions while awaiting confirmation', async () => {
    const user = userEvent.setup();
    let resolveConfirmation: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirmation = resolve;
        }),
    );

    render(
      <ConfirmDialog
        triggerLabel="删除本机记录"
        title="删除这条本机历史？"
        confirmLabel="删除本机记录"
        onConfirm={onConfirm}
      />,
    );

    const trigger = screen.getByRole('button', {name: '删除本机记录'});
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', {name: '删除本机记录'}));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole('button', {name: '正在处理'})).toBeDisabled();
    expect(within(dialog).getByRole('button', {name: '取消'})).toBeDisabled();
    expect(within(dialog).getByRole('button', {name: '关闭'})).toBeDisabled();

    await act(async () => resolveConfirmation?.());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
