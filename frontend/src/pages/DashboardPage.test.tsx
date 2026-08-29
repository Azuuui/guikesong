import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {describe,expect,it,vi} from 'vitest';
import {DashboardPage} from './DashboardPage';

vi.mock('../features/background/ParticleRevealBackground',()=>({
  ParticleRevealBackground:()=> <div data-testid="particle-reveal-background" />,
}));

function renderPage(entry='/'){
  render(<MemoryRouter initialEntries={[entry]}><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage',()=>{
  it('呈现品牌式标题、主页粒子背景和一句话生成入口',()=>{
    renderPage();
    expect(screen.getByTestId('particle-reveal-background')).toBeInTheDocument();
    expect(screen.getByRole('heading',{level:1,name:'你给一个选题它还你一座城的流量'})).toBeVisible();
    expect(screen.getByText('一次灵感输入，全套图文输出，文旅爆款即刻启程。')).toBeVisible();
    expect(screen.queryByText(/从一句话开始/)).not.toBeInTheDocument();
    expect(screen.queryByText(/QIANSCAPE AI \/ TRAVEL CREATIVE STUDIO/)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:'一句话创作需求'})).toHaveAttribute('placeholder','输入地点、主题和想要传达的感觉');
    expect(screen.queryByText('输入地点、主题和想要传达的感觉')).not.toBeInTheDocument();
  });

  it('默认选择小红书图鉴，点击其他模板只切换并保留输入',async()=>{
    const user=userEvent.setup();
    renderPage();
    const textbox=screen.getByRole('textbox',{name:'一句话创作需求'});
    await user.type(textbox,'贵阳的12种美食');
    expect(screen.getByRole('button',{name:'选择模板：小红书图鉴创作'})).toHaveAttribute('aria-pressed','true');
    await user.click(screen.getByRole('button',{name:'选择模板：原创 IP 商品化'}));
    expect(screen.getByRole('button',{name:'选择模板：原创 IP 商品化'})).toHaveAttribute('aria-pressed','true');
    expect(textbox).toHaveValue('贵阳的12种美食');
  });

  it('模板查询参数可以预选原创 IP',()=>{
    renderPage('/?template=original-ip');
    expect(screen.getByRole('button',{name:'选择模板：原创 IP 商品化'})).toHaveAttribute('aria-pressed','true');
  });
});
