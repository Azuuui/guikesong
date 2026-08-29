import {ArrowLeft, FileX} from '@phosphor-icons/react';
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';

type NotFoundPageProps = {
  title?: string;
  message?: string;
  actions?: ReactNode;
};

export function NotFoundPage({
  title = '没有找到这条生成结果',
  message = '这条生成结果已经不在当前浏览器中。',
  actions,
}: NotFoundPageProps) {
  return (
    <section aria-labelledby="not-found-page-title" className="empty-state not-found-page">
      <span aria-hidden="true" className="empty-state__icon"><FileX size={24} /></span>
      <h1 id="not-found-page-title">{title}</h1>
      <p>{message}</p>
      <div className="not-found-page__actions">
        {actions ?? (
          <Link className="button empty-state__action" to="/templates">
            <ArrowLeft aria-hidden="true" size={18} weight="bold" />
            返回模板中心
          </Link>
        )}
      </div>
    </section>
  );
}
