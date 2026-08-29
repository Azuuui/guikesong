import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {describe,expect,it,vi} from 'vitest';
import {HomeTemplateRail} from './HomeTemplateRail';

describe('HomeTemplateRail',()=>{
  it('默认按图鉴、原创 IP、手绘攻略、照片图集的顺序展示',()=>{
    render(<MemoryRouter><HomeTemplateRail onSelect={vi.fn()} selectedWorkflowId="xhs-atlas" /></MemoryRouter>);
    expect(screen.getAllByRole('button',{name:/选择模板/}).map(button=>button.getAttribute('aria-label'))).toEqual([
      '选择模板：小红书种草图鉴',
      '选择模板：文创 IP 商品大片',
      '选择模板：目的地手绘攻略',
      '选择模板：游客返图海报',
    ]);
  });

  it('点击卡片只切换选择，详情链接进入独立页面',async()=>{
    const user=userEvent.setup();
    const onSelect=vi.fn();
    render(<MemoryRouter><HomeTemplateRail onSelect={onSelect} selectedWorkflowId="xhs-atlas" /></MemoryRouter>);

    await user.click(screen.getByRole('button',{name:'选择模板：文创 IP 商品大片'}));
    expect(onSelect).toHaveBeenCalledWith('original-ip');

    const detail=screen.getByRole('link',{name:'查看文创 IP 商品大片详情'});
    expect(detail).toHaveAttribute('href','/templates/original-ip');
    await user.click(detail);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('当前模板公开选中状态',()=>{
    render(<MemoryRouter><HomeTemplateRail onSelect={vi.fn()} selectedWorkflowId="xhs-atlas" /></MemoryRouter>);
    expect(screen.getByRole('button',{name:'选择模板：小红书种草图鉴'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{name:'选择模板：文创 IP 商品大片'})).toHaveAttribute('aria-pressed','false');
  });
});
