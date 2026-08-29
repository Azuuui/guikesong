import {render,screen} from '@testing-library/react';
import {createMemoryRouter,RouterProvider} from 'react-router-dom';
import {describe,expect,it} from 'vitest';
import {TemplateDetailPage} from './TemplateDetailPage';

function renderPage(path:string){
  const router=createMemoryRouter([{path:'/templates/:templateId',element:<TemplateDetailPage />}],{initialEntries:[path]});
  render(<RouterProvider router={router} />);
}

describe('TemplateDetailPage',()=>{
  it('呈现模板说明并返回主页选中该模板',()=>{
    renderPage('/templates/xhs-atlas');
    expect(screen.getByRole('heading',{level:1,name:'小红书种草图鉴'})).toBeVisible();
    expect(screen.getByText('适用场景')).toBeVisible();
    expect(screen.getByText('输入建议')).toBeVisible();
    expect(screen.getByRole('link',{name:'用此模板创作'})).toHaveAttribute('href','/?template=xhs-atlas#composer');
  });

  it('未知模板显示可恢复空状态',()=>{
    renderPage('/templates/missing');
    expect(screen.getByRole('heading',{level:1,name:'没有找到这个模板'})).toBeVisible();
    expect(screen.getByRole('link',{name:'返回全部模板'})).toHaveAttribute('href','/templates');
  });
});
