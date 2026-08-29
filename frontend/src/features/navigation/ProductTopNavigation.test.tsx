import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe,expect,it} from 'vitest';
import {ProductTopNavigation} from './ProductTopNavigation';

function renderNavigation(pathname:string){
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <ProductTopNavigation />
    </MemoryRouter>,
  );
}

describe('ProductTopNavigation',()=>{
  it('在主页展示品牌、主页活动页签和历史入口',()=>{
    renderNavigation('/');

    expect(screen.getByRole('link',{name:/黔景智作/})).toHaveAttribute('href','/');
    expect(screen.getByText('QianScape AI')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'主页'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('link',{name:'全部模板'})).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link',{name:'历史记录'})).toHaveAttribute('title','历史记录');
  });

  it.each([
    '/templates',
    '/templates/original-ip',
    '/templates/original-ip/create',
  ])('把 %s 归入全部模板页签',(pathname)=>{
    renderNavigation(pathname);

    expect(screen.getByRole('link',{name:'全部模板'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('link',{name:'主页'})).not.toHaveAttribute('aria-current');
  });

  it('历史详情只选中历史图标，不伪造中部页签状态',()=>{
    renderNavigation('/history/record-1');

    expect(screen.getByRole('link',{name:'主页'})).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link',{name:'全部模板'})).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link',{name:'历史记录'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('link',{name:'历史记录'})).toHaveClass('product-top-navigation__history--active');
  });

  it('结果页不选中主页或模板',()=>{
    renderNavigation('/results/request-1');

    expect(screen.getByRole('link',{name:'主页'})).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link',{name:'全部模板'})).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link',{name:'历史记录'})).not.toHaveAttribute('aria-current');
  });
});
