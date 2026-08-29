import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import type {GenerationJobPhase,GenerationJobSnapshot} from '../../../../shared/generationJobs';
import {makeXhsAtlasResult} from '../../test/fixtures';
import {HomeGenerationStatus,type HomeGenerationStatusProps} from './HomeGenerationStatus';

const NOW='2026-08-30T00:00:00.000Z';
const RESULT=makeXhsAtlasResult({requestId:'job-1'});

function makeJob(overrides:Partial<GenerationJobSnapshot>={}):GenerationJobSnapshot{
  return {
    jobId:'job-1',
    workflowId:'xhs-atlas',
    status:'queued',
    phase:'preparing',
    completedImages:0,
    totalImages:0,
    createdAt:NOW,
    updatedAt:NOW,
    result:null,
    error:null,
    ...overrides,
  };
}

function renderStatus(overrides:Partial<HomeGenerationStatusProps>={}){
  const props:HomeGenerationStatusProps={
    job:null,
    connectionState:'idle',
    onOpenResult:vi.fn(),
    ...overrides,
  };
  return {...props,...render(<HomeGenerationStatus {...props} />)};
}

describe('HomeGenerationStatus',()=>{
  it.each([
    ['preparing','正在整理选题'],
    ['content','正在生成内容清单'],
    ['copy','正在生成文案'],
    ['finalizing','正在整理生成结果'],
  ])('阶段 %s 显示文案 %s',(phase,text:string)=>{
    renderStatus({job:makeJob({status:'running',phase:phase as GenerationJobPhase})});
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('图片阶段显示当前生成计数',()=>{
    const first=renderStatus({job:makeJob({status:'running',phase:'images',completedImages:0,totalImages:2})});
    expect(screen.getByRole('status')).toHaveTextContent('正在生成图片 1/2');
    first.unmount();

    renderStatus({job:makeJob({status:'running',phase:'images',completedImages:1,totalImages:2})});
    expect(screen.getByRole('status')).toHaveTextContent('正在生成图片 2/2');
  });

  it('图片阶段计数不越过总数',()=>{
    const {rerender}=render(
      <HomeGenerationStatus
        job={makeJob({status:'running',phase:'images',completedImages:2,totalImages:2})}
        connectionState="connected"
        onOpenResult={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在生成图片 2/2');
    rerender(
      <HomeGenerationStatus
        job={makeJob({status:'running',phase:'images',completedImages:1,totalImages:4})}
        connectionState="connected"
        onOpenResult={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在生成图片 2/4');
  });

  it('查询失败时显示正在重新连接',()=>{
    renderStatus({job:makeJob({status:'running',phase:'content'}),connectionState:'reconnecting'});
    expect(screen.getByRole('status')).toHaveTextContent('正在重新连接');
  });

  it('图片进度线按完成比例渲染',()=>{
    renderStatus({job:makeJob({status:'running',phase:'images',completedImages:1,totalImages:4})});
    const bar=document.querySelector<HTMLElement>('.home-generation-status__progress-bar');
    expect(bar).toHaveStyle({width:'25%'});
  });

  it('成功终态提供查看结果入口',()=>{
    const onOpenResult=vi.fn();
    renderStatus({job:makeJob({status:'succeeded',result:RESULT}),onOpenResult});
    expect(screen.getByRole('status')).toHaveTextContent('素材已生成');
    fireEvent.click(screen.getByRole('button',{name:'查看结果'}));
    expect(onOpenResult).toHaveBeenCalledTimes(1);
  });

  it('部分成功终态提示部分素材已完成并可查看',()=>{
    const onOpenResult=vi.fn();
    renderStatus({job:makeJob({status:'partial',result:RESULT}),onOpenResult});
    expect(screen.getByRole('status')).toHaveTextContent('部分素材已完成');
    fireEvent.click(screen.getByRole('button',{name:'查看结果'}));
    expect(onOpenResult).toHaveBeenCalledTimes(1);
  });

  it('失败终态显示安全错误并提供重新生成',()=>{
    const onRetry=vi.fn();
    renderStatus({
      job:makeJob({status:'failed',error:{code:'INTERNAL_ERROR',message:'生成失败，请稍后重试'}}),
      onRetry,
    });
    expect(screen.getByRole('status')).toHaveTextContent('生成失败，请稍后重试');
    fireEvent.click(screen.getByRole('button',{name:'重新生成'}));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('历史保存失败时显示警告并可重试',()=>{
    const onRetryHistorySave=vi.fn();
    renderStatus({
      job:makeJob({status:'succeeded',result:RESULT}),
      historySaveWarning:'素材已经生成，但未能保存到本机历史。请先下载素材包。',
      onRetryHistorySave,
    });
    expect(screen.getByRole('alert')).toHaveTextContent('素材已经生成，但未能保存到本机历史。请先下载素材包。');
    fireEvent.click(screen.getByRole('button',{name:'重试保存'}));
    expect(onRetryHistorySave).toHaveBeenCalledTimes(1);
  });

  it('任务过期时提示重新生成',()=>{
    renderStatus({job:null,jobExpired:true});
    expect(screen.getByRole('status')).toHaveTextContent('生成任务已过期或不存在，请重新生成。');
  });

  it('无任务且未过期时不渲染任何内容',()=>{
    const {container}=renderStatus({job:null});
    expect(container).toBeEmptyDOMElement();
  });

  it('连接状态 idle 与运行中任务并存时优先展示阶段',()=>{
    renderStatus({job:makeJob({status:'running',phase:'copy'}),connectionState:'idle'});
    expect(screen.getByRole('status')).toHaveTextContent('正在生成文案');
  });
});
