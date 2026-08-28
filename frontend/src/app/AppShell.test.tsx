import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter, RouterProvider} from 'react-router-dom';
import {describe, expect, it} from 'vitest';
import {AppShell} from './AppShell';
import {appRouter} from './AppRouter';

function renderShell(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          {index: true, element: <h1>工作台页面</h1>},
          {path: 'templates', element: <h1>模板中心页面</h1>},
          {path: 'history', element: <h1>历史记录页面</h1>},
        ],
      },
    ],
    {initialEntries: [initialEntry]},
  );

  render(<RouterProvider router={router} />);
}

describe('AppShell', () => {
  it('桌面导航只展示三个一级入口', () => {
    renderShell('/');

    const navigation = screen.getByRole('navigation', {name: '桌面主导航'});
    const links = within(navigation).getAllByRole('link');

    expect(links).toHaveLength(3);
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      '工作台',
      '模板中心',
      '历史记录',
    ]);
  });

  it('按当前路由高亮桌面导航', () => {
    renderShell('/templates');

    const navigation = screen.getByRole('navigation', {name: '桌面主导航'});
    expect(within(navigation).getByRole('link', {name: '模板中心'})).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('link', {name: '工作台'})).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(navigation).getByRole('link', {name: '历史记录'})).not.toHaveAttribute(
      'aria-current',
    );
  });

  it.each([
    ['/', '工作台'],
    ['/templates', '模板中心'],
    ['/templates/ip-image/create', '模板创建'],
    ['/results/request-1', '生成结果'],
    ['/history', '历史记录'],
    ['/history/record-1', '历史详情'],
  ])('可直接访问固定路由 %s', (path, pageName) => {
    const router = createMemoryRouter(appRouter.routes, {initialEntries: [path]});

    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', {level: 1, name: pageName})).toBeVisible();
  });

  it('移动导航打开后聚焦抽屉，并在 Esc 关闭后恢复焦点', async () => {
    const user = userEvent.setup();
    renderShell('/');

    const menuButton = screen.getByRole('button', {name: '打开导航'});
    await user.click(menuButton);

    const drawer = screen.getByRole('dialog', {name: '移动导航抽屉'});
    expect(within(drawer).getByRole('button', {name: '关闭导航'})).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', {name: '移动导航抽屉'})).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });
});
