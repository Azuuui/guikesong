import {
  CheckCircle,
  CircleNotch,
  Info,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import type {ReactNode} from 'react';

export type StatusBadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'loading';

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
};

const ICONS = {
  success: CheckCircle,
  warning: WarningCircle,
  error: XCircle,
  info: Info,
  neutral: Info,
  loading: CircleNotch,
} as const;

export function StatusBadge({children, tone = 'neutral'}: StatusBadgeProps) {
  const Icon = ICONS[tone];

  return (
    <span className={`status-badge status-badge--${tone}`}>
      <Icon
        aria-hidden="true"
        className={tone === 'loading' ? 'status-badge__spinner' : undefined}
        size={16}
        weight="bold"
      />
      <span>{children}</span>
    </span>
  );
}
