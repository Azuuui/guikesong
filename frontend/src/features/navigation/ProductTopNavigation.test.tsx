import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {GenerationJobSnapshot} from '../../../../shared/generationJobs';
import {makeGenerateResult} from '../../test/fixtures';
import {
  GenerationJobProvider,
  useGenerationJob,
  type GenerationJobDependencies,
  type StartGenerationInput,
} from '../generation/GenerationJobProvider';
import {ProductTopNavigation} from './ProductTopNavigation';

const NOW='2026-08-30T00:00:00.000Z';
const RESULT=makeGenerateResult({workflowId:'xhs-atlas',requestId:'job-1'});

const SUBMISSION:StartGenerationInput={
  request:{workflowId:'xhs-atlas',topic:'2个贵州景点',referenceAssetIds:[]},
  userPrompt:'2个贵州景点',
  referenceFiles:[],
};

const createGenerationJobMock=vi.fn();
const getGenerationJobMock=vi.fn();
const saveHistoryMock=vi.fn();

const DEPENDENCIES:GenerationJobDependencies={
  createGenerationJob:createGenerationJobMock,
  getGenerationJob:getGenerationJobMock,
  saveHistory:saveHistoryMock,
};

function makeSnapshot(overrides:Partial<GenerationJobSnapshot>={}):GenerationJobSnapshot{
  return {
    jobId:'job-1',
    workflowId:'xhs-atlas',
    status:'running',
    phase:'images',
    completedImages:0,
    totalImages:2,
    createdAt:NOW,
    updatedAt:NOW,
    result:null,
    error:null,
    ...overrides,
  };
}

function JobStarter(){
  const {startGeneration}=useGenerationJob();
  return <button onClick={()=>void startGeneration(SUBMISSION)} type="button">启动任务</button>;
}

function renderNavigation(pathname:string){
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <GenerationJobProvider dependencies={DEPENDENCIES}>
        <ProductTopNavigation />
      </GenerationJobProvider>
    </MemoryRouter>,
  );
}

function renderNavigationWithJob(pathname:string){
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <GenerationJobProvider dependencies={DEPENDENCIES}>
        <ProductTopNavigation />
        <JobStarter />
      </GenerationJobProvider>
    </MemoryRouter>,
  );
}

describe('ProductTopNavigation',()=>{
  beforeEach(()=>{
    createGenerationJobMock.mockReset();
    getGenerationJobMock.mockReset();
    saveHistoryMock.mockReset().mockResolvedValue(undefined);
    createGenerationJobMock.mockResolvedValue({jobId:'job-1',status:'queued',createdAt:NOW});
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status:'running',phase:'images'}));
  });

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

  it('无活动任务时不渲染状态圆点',()=>{
    renderNavigation('/templates');
    expect(screen.queryByTestId('generation-job-indicator')).not.toBeInTheDocument();
  });

  it('运行中任务在历史图标旁显示运行圆点',async()=>{
    renderNavigationWithJob('/templates');

    fireEvent.click(screen.getByRole('button',{name:'启动任务'}));

    const indicator=await screen.findByTestId('generation-job-indicator');
    expect(indicator).toHaveAttribute('data-state','running');
    expect(indicator).toHaveTextContent('素材正在生成');
  });

  it('终态任务未查看时显示完成圆点',async()=>{
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status:'succeeded',result:RESULT}));
    renderNavigationWithJob('/templates');

    fireEvent.click(screen.getByRole('button',{name:'启动任务'}));

    const indicator=await screen.findByTestId('generation-job-indicator');
    await waitFor(()=>expect(indicator).toHaveAttribute('data-state','complete'));
    expect(indicator).toHaveTextContent('素材生成完成');
  });

  it('失败任务显示失败状态而不是完成文案',async()=>{
    getGenerationJobMock.mockResolvedValue(makeSnapshot({
      status:'failed',
      error:{code:'UPSTREAM_ERROR',message:'生成失败，请稍后重试'},
    }));
    renderNavigationWithJob('/templates');

    fireEvent.click(screen.getByRole('button',{name:'启动任务'}));

    const indicator=await screen.findByTestId('generation-job-indicator');
    await waitFor(()=>expect(indicator).toHaveAttribute('data-state','failed'));
    expect(indicator).toHaveTextContent('素材生成失败');
    expect(indicator).not.toHaveTextContent('素材生成完成');
  });
});
