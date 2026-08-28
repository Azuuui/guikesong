import {ImageSquare} from '@phosphor-icons/react';
import type {ReactNode} from 'react';
import {useId} from 'react';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({title, description, action, icon}: EmptyStateProps) {
  const titleId = useId();

  return (
    <section className="empty-state" aria-labelledby={titleId}>
      <div className="empty-state__icon" aria-hidden="true">
        {icon ?? <ImageSquare size={28} weight="duotone" />}
      </div>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  );
}
