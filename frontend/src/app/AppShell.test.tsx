import {render,screen,within} from '@testing-library/react';
import {createMemoryRouter,RouterProvider} from 'react-router-dom';
import {describe,expect,it,vi} from 'vitest';
import {appRouter} from './AppRouter';
import {AppShell} from './AppShell';

vi.mock('../features/background/ParticleRevealBackground',()=>({
  ParticleRevealBackground:()=> <div data-testid="particle-background" />,
}));

function renderShell(initialEntry:string){
  const router=createMemoryRouter([
    {
      element:<AppShell />,
      children:[
        {index:true,element:<h1>主页内容</h1>},
        {path:'templates',element:<h1>全部模板内容</h1>},
        {path:'templates/:templateId',element:<h1>模板详情内容</h1>},
        {path:'history',element:<h1>历史记录内容</h1>},
        {path:'history/:recordId',element:<h1>历史详情内容</h1>},
      ],
    },
  ],{initialEntries:[initialEntry]});
  render(<RouterProvider router={router} />);
}

describe('AppShell',()=>{
  it('全局只呈现顶部产品导航，不再渲染侧边栏或移动抽屉',()=>{
    renderShell('/');
    const navigation=screen.getByRole('navigation',{name:'主导航'});
    expect(within(navigation).getAllByRole('link').map(link=>link.textContent)).toEqual(['主页','全部模板']);
    expect(screen.getByRole('link',{name:'历史记录'})).toBeVisible();
    expect(document.querySelector('.app-shell__sidebar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'打开导航'})).not.toBeInTheDocument();
  });

  it('模板详情仍归属全部模板活动页签',()=>{
    renderShell('/templates/xhs-atlas');
    expect(screen.getByRole('link',{name:'全部模板'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('link',{name:'主页'})).not.toHaveAttribute('aria-current');
  });

  it('历史详情只激活右侧历史入口',()=>{
    renderShell('/history/record-1');
    expect(screen.getByRole('link',{name:'历史记录'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('link',{name:'主页'})).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link',{name:'全部模板'})).not.toHaveAttribute('aria-current');
  });

  it.each([
    ['/','你给一个选题它还你一座城的流量'],
    ['/templates','全部模板'],
    ['/templates/xhs-atlas','小红书图鉴创作'],
    ['/templates/original-ip/create','原创 IP 商品化'],
    ['/results/request-1','没有找到这条生成结果'],
    ['/history','本机历史'],
    ['/history/record-1','这条生成结果已经不在当前浏览器中'],
  ])('可直接访问固定路由 %s',async(path,pageName)=>{
    const router=createMemoryRouter(appRouter.routes,{initialEntries:[path]});
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading',{level:1,name:pageName})).toBeVisible();
  });
});
