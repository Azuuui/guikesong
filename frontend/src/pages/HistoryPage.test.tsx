import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {GenerationJobSnapshot} from '../../../shared/generationJobs';
import {makeGenerateResult} from '../test/fixtures';
import {
  GenerationJobProvider,
  useGenerationJob,
  type GenerationJobDependencies,
  type StartGenerationInput,
} from '../features/generation/GenerationJobProvider';
import {HistoryPage} from './HistoryPage';

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
    completedImages:1,
    totalImages:3,
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

function LocationProbe(){
  const {pathname}=useLocation();
  return <div data-testid="route-location">{pathname}</div>;
}

function renderPage(withJob=false){
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <GenerationJobProvider dependencies={DEPENDENCIES}>
        {withJob?<JobStarter />:null}
        <Routes>
          <Route element={<LocationProbe />} path="*" />
          <Route element={<HistoryPage />} path="/history" />
        </Routes>
      </GenerationJobProvider>
    </MemoryRouter>,
  );
}

describe('HistoryPage',()=>{
  beforeEach(()=>{
    createGenerationJobMock.mockReset();
    getGenerationJobMock.mockReset();
    saveHistoryMock.mockReset().mockResolvedValue(undefined);
    createGenerationJobMock.mockResolvedValue({jobId:'job-1',status:'queued',createdAt:NOW});
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status:'running',phase:'images'}));
  });

  it('无活动任务时不显示任务摘要，空状态保持不变',async()=>{
    renderPage();

    expect(await screen.findByText('还没有生成记录')).toBeInTheDocument();
    expect(screen.queryByTestId('history-job-summary')).not.toBeInTheDocument();
  });

  it('运行中任务在列表上方显示阶段摘要',async()=>{
    renderPage(true);

    fireEvent.click(screen.getByRole('button',{name:'启动任务'}));

    const summary=await screen.findByTestId('history-job-summary');
    await waitFor(()=>expect(summary).toHaveTextContent('正在生成图片'));
  });

  it('终态任务在摘要中提供查看结果入口并跳转结果页',async()=>{
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status:'succeeded',result:RESULT}));
    renderPage(true);

    fireEvent.click(screen.getByRole('button',{name:'启动任务'}));
    fireEvent.click(await screen.findByRole('button',{name:'查看结果'}));

    expect(await screen.findByTestId('route-location')).toHaveTextContent('/results/job-1');
  });

  it('失败任务摘要使用失败语义而不是成功终态样式',async()=>{
    getGenerationJobMock.mockResolvedValue(makeSnapshot({
      status:'failed',
      error:{code:'UPSTREAM_ERROR',message:'生成失败，请稍后重试'},
    }));
    renderPage(true);

    fireEvent.click(screen.getByRole('button',{name:'启动任务'}));
    const summary=await screen.findByTestId('history-job-summary');
    await waitFor(()=>expect(summary).toHaveClass('history-job-summary--failed'));
    expect(summary).toHaveTextContent('生成失败，请稍后重试');
  });
});
