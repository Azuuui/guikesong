import {createBrowserRouter} from 'react-router-dom';
import {DashboardPage} from '../pages/DashboardPage';
import {TemplatesPage} from '../pages/TemplatesPage';
import {AppShell} from './AppShell';

export const ROUTES = {
  dashboard: '/',
  templates: '/templates',
  create: '/templates/:templateId/create',
  result: '/results/:requestId',
  history: '/history',
  historyDetail: '/history/:recordId',
} as const;

type TemporaryPageProps = {
  title: string;
  description: string;
};

function TemporaryPage({title, description}: TemporaryPageProps) {
  const headingId = `page-${title}`;

  return (
    <section aria-labelledby={headingId} className="page-placeholder">
      <p className="page-placeholder__eyebrow">文旅营销素材生成</p>
      <h1 id={headingId}>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

export const appRouter = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        path: ROUTES.dashboard,
        element: <DashboardPage />,
      },
      {
        path: ROUTES.templates,
        element: <TemplatesPage />,
      },
      {
        path: ROUTES.create,
        element: <TemporaryPage title="模板创建" description="填写需求并添加可选参考图。" />,
      },
      {
        path: ROUTES.result,
        element: <TemporaryPage title="生成结果" description="查看、复制和下载本次生成内容。" />,
      },
      {
        path: ROUTES.history,
        element: <TemporaryPage title="历史记录" description="管理当前浏览器保存的最近结果。" />,
      },
      {
        path: ROUTES.historyDetail,
        element: <TemporaryPage title="历史详情" description="查看保存在本机的完整生成结果。" />,
      },
    ],
  },
]);
