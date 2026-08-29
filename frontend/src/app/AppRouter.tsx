import {createBrowserRouter} from 'react-router-dom';
import {DashboardPage} from '../pages/DashboardPage';
import {CreatePage} from '../pages/CreatePage';
import {ResultPage} from '../pages/ResultPage';
import {TemplatesPage} from '../pages/TemplatesPage';
import {HistoryPage} from '../pages/HistoryPage';
import {HistoryDetailPage} from '../pages/HistoryDetailPage';
import {NotFoundPage} from '../pages/NotFoundPage';
import {TemplateDetailPage} from '../pages/TemplateDetailPage';
import {AppShell} from './AppShell';

export const ROUTES = {
  dashboard: '/',
  templates: '/templates',
  templateDetail: '/templates/:templateId',
  create: '/templates/:templateId/create',
  result: '/results/:requestId',
  history: '/history',
  historyDetail: '/history/:recordId',
} as const;

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
        path: ROUTES.templateDetail,
        element: <TemplateDetailPage />,
      },
      {
        path: ROUTES.create,
        element: <CreatePage />,
      },
      {
        path: ROUTES.result,
        element: <ResultPage />,
      },
      {
        path: ROUTES.history,
        element: <HistoryPage />,
      },
      {
        path: ROUTES.historyDetail,
        element: <HistoryDetailPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
