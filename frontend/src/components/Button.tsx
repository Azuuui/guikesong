import {CircleNotch} from '@phosphor-icons/react';
import type React from 'react';
import {forwardRef} from 'react';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  loadingLabel?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className = '',
    disabled,
    loading = false,
    loadingLabel = '正在处理',
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  const classes = ['button', `button--${variant}`, className].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      ref={ref}
      type={type}
    >
      {loading ? (
        <>
          <CircleNotch aria-hidden="true" className="button__spinner" size={18} weight="bold" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
