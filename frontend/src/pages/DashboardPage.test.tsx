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
    expect(screen.getByRole('button',{name:'选择模板：小红书种草图鉴'})).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{name:'选择模板：文创 IP 商品大片'})).toHaveAttribute('aria-pressed','false');
    expect(screen.getByText('尚未选择模板，点击下方模板开始')).toBeVisible();
  });

  it('未选模板时灰字保持通用文案，点选模板后跟随模板并保留输入',async()=>{
    const user=userEvent.setup();
    renderPage();
    const textbox=screen.getByRole('textbox',{name:'一句话创作需求'});
    expect(textbox).toHaveAttribute('placeholder','输入地点、主题和想要传达的感觉');
    await user.type(textbox,'贵阳的12种美食');
    await user.click(screen.getByRole('button',{name:'选择模板：文创 IP 商品大片'}));
    expect(screen.getByRole('button',{name:'选择模板：文创 IP 商品大片'})).toHaveAttribute('aria-pressed','true');
    expect(textbox).toHaveValue('贵阳的12种美食');
    expect(textbox).toHaveAttribute('placeholder','先初始化并锁定 IP 档案，每次生成上传一张主打产品图，并用一句话描述产品。');
    expect(screen.getByText('当前使用：文创 IP 商品大片')).toBeVisible();
  });

  it('未选模板时提交会提示先选模板',async()=>{
    const user=userEvent.setup();
    renderPage();
    const textbox=screen.getByRole('textbox',{name:'一句话创作需求'});
    await user.type(textbox,'贵州避暑');
    await user.click(screen.getByRole('button',{name:'开始生成'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('请先在下方选择一个模板。');
  });

  it('模板查询参数可以预选原创 IP 并直接显示该模板输入建议',()=>{
    renderPage('/?template=original-ip');
    expect(screen.getByRole('button',{name:'选择模板：文创 IP 商品大片'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('textbox',{name:'一句话创作需求'})).toHaveAttribute('placeholder','先初始化并锁定 IP 档案，每次生成上传一张主打产品图，并用一句话描述产品。');
  });
});
