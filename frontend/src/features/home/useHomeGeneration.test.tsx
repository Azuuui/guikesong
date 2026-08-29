import {act,renderHook,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {GenerationJobSnapshot} from '../../../../shared/generationJobs';
import type {ReferenceAsset,WorkflowId} from '../../../../shared/types';
import {makeXhsAtlasResult} from '../../test/fixtures';
import {
  GenerationJobProvider,
  type GenerationJobDependencies,
} from '../generation/GenerationJobProvider';
import {ApiError} from '../generation/api';
import {useHomeGeneration,type HomeGenerationDependencies} from './useHomeGeneration';

const ASSET:ReferenceAsset={
  assetId:'asset-1',url:'/asset-1',originalName:'ref.png',mediaType:'image/png',size:3,createdAt:'2026-08-29T00:00:00.000Z',
};

const NOW='2026-08-30T00:00:00.000Z';

function makeSnapshot(overrides:Partial<GenerationJobSnapshot>={}):GenerationJobSnapshot{
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

const RESULT=makeXhsAtlasResult({requestId:'job-1'});

const createGenerationJobMock=vi.fn();
const getGenerationJobMock=vi.fn();
const saveHistoryMock=vi.fn();

const PROVIDER_DEPENDENCIES:GenerationJobDependencies={
  createGenerationJob:createGenerationJobMock,
  getGenerationJob:getGenerationJobMock,
  saveHistory:saveHistoryMock,
};

function setup(overrides:Partial<HomeGenerationDependencies>={},initialWorkflowId:WorkflowId='xhs-atlas'){
  const navigate=vi.fn();
  const dependencies:HomeGenerationDependencies={
    createObjectURL:vi.fn(()=>`blob:preview-${Math.random()}`),
    revokeObjectURL:vi.fn(),
    getActiveIpProfile:vi.fn().mockResolvedValue(null),
    uploadReferenceFiles:vi.fn().mockResolvedValue([ASSET]),
    ...overrides,
  };
  const hook=renderHook(()=>useHomeGeneration({dependencies,initialWorkflowId,navigate}),{
    wrapper({children}:{children:ReactNode}){
      return (
        <MemoryRouter>
          <GenerationJobProvider dependencies={PROVIDER_DEPENDENCIES}>
            {children}
          </GenerationJobProvider>
        </MemoryRouter>
      );
    },
  });
  return {navigate,dependencies,...hook};
}

describe('useHomeGeneration',()=>{
  beforeEach(()=>{
    createGenerationJobMock.mockReset();
    getGenerationJobMock.mockReset();
    saveHistoryMock.mockReset().mockResolvedValue(undefined);
    createGenerationJobMock.mockResolvedValue({jobId:'job-1',status:'queued',createdAt:NOW});
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status:'succeeded',result:RESULT}));
  });

  it('默认图鉴工作流，切换模板保留输入和附件',()=>{
    const {result}=setup();
    const file=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('贵阳的12种美食');
      result.current.addFiles([file]);
      result.current.selectWorkflow('original-ip');
    });
    expect(result.current.selectedWorkflowId).toBe('original-ip');
    expect(result.current.prompt).toBe('贵阳的12种美食');
    expect(result.current.attachments).toHaveLength(1);
  });

  it('图鉴从主页上传参考图并创建后台生成任务',async()=>{
    const {result,dependencies,navigate}=setup();
    const file=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('贵阳的12种美食');
      result.current.addFiles([file]);
    });
    await act(async()=>result.current.submit());

    expect(dependencies.uploadReferenceFiles).toHaveBeenCalledWith([file],expect.any(AbortSignal));
    expect(createGenerationJobMock).toHaveBeenCalledWith({
      workflowId:'xhs-atlas',topic:'贵阳的12种美食',referenceAssetIds:['asset-1'],
    });
    // 结果保存与结果页跳转由应用级 Provider 负责。
    expect(saveHistoryMock).toHaveBeenCalledTimes(1);
    expect(saveHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
      jobId:'job-1',
      userPrompt:'贵阳的12种美食',
    }));
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(()=>expect(result.current.busy).toBe(false));
  });

  it('图鉴从主页识别中文数量并创建任务',async()=>{
    const {result}=setup();
    act(()=>result.current.setPrompt('两个贵州景点'));
    await act(async()=>result.current.submit());

    expect(createGenerationJobMock).toHaveBeenCalledWith({
      workflowId:'xhs-atlas',topic:'两个贵州景点',referenceAssetIds:[],
    });
    await waitFor(()=>expect(result.current.busy).toBe(false));
  });

  it('原创 IP 没有锁定档案时保留输入与产品图进入配置页',async()=>{
    const {result,navigate}=setup({},'original-ip');
    const file=new File(['product'],'product.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('苗绣纹样马克杯');
      result.current.addFiles([file]);
    });
    await act(async()=>result.current.submit());

    expect(navigate).toHaveBeenCalledWith('/templates/original-ip/create',{state:{
      initialPrompt:'苗绣纹样马克杯',
      restoredFiles:[expect.objectContaining({name:'product.png',mediaType:'image/png',blob:file})],
    }});
    expect(createGenerationJobMock).not.toHaveBeenCalled();
  });

  it('原创 IP 已锁定时上传产品图并创建后台任务',async()=>{
    const {result,dependencies}=setup({
      getActiveIpProfile:vi.fn().mockResolvedValue({
        ipProfileId:'profile-1',version:1,name:'苗苗',referenceImageUrl:'/ip.png',description:'苗族IP',status:'locked',
      }),
    },'original-ip');
    const file=new File(['product'],'product.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('苗绣纹样马克杯');
      result.current.addFiles([file]);
    });
    await act(async()=>result.current.submit());
    expect(dependencies.uploadReferenceFiles).toHaveBeenCalledWith([file],expect.any(AbortSignal));
    expect(createGenerationJobMock).toHaveBeenCalledWith({
      workflowId:'original-ip',ipProfileId:'profile-1',productAssetId:'asset-1',productDescription:'苗绣纹样马克杯',
    });
  });

  it('拒绝无效图片并在卸载时释放预览地址',()=>{
    const {result,dependencies,unmount}=setup();
    act(()=>result.current.addFiles([new File(['text'],'note.txt',{type:'text/plain'})]));
    expect(result.current.error).toBe('仅支持 JPG、PNG、WebP 图片。');
    const image=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>result.current.addFiles([image]));
    const preview=result.current.attachments[0]?.previewUrl;
    unmount();
    expect(dependencies.revokeObjectURL).toHaveBeenCalledWith(preview);
  });

  it('手绘攻略校验目的地且拒绝参考图，合法目的地创建任务',async()=>{
    const {result,dependencies,navigate}=setup({},'travel-guide');

    act(()=>result.current.setPrompt('中国'));
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('目的地范围过大，请输入城市或景点，如"成都"或"杭州西湖"');
    expect(createGenerationJobMock).not.toHaveBeenCalled();

    const file=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('成都');
      result.current.addFiles([file]);
    });
    expect(result.current.error).toBe('手绘攻略不需要参考图片，直接输入目的地即可。');
    expect(result.current.attachments).toHaveLength(0);
    expect(dependencies.uploadReferenceFiles).not.toHaveBeenCalled();

    await act(async()=>result.current.submit());
    expect(createGenerationJobMock).toHaveBeenCalledWith({
      workflowId:'travel-guide',destination:'成都',
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('游客返图校验照片数量并上传后创建任务',async()=>{
    const {result,dependencies}=setup({},'ugc-photo-campaign');

    act(()=>result.current.setPrompt('夏天的风'));
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('游客返图需要至少 1 张照片。');
    expect(createGenerationJobMock).not.toHaveBeenCalled();

    const photo=new File(['photo'],'photo.png',{type:'image/png'});
    act(()=>result.current.addFiles([photo]));
    await act(async()=>result.current.submit());
    expect(dependencies.uploadReferenceFiles).toHaveBeenCalledWith([photo],expect.any(AbortSignal));
    expect(createGenerationJobMock).toHaveBeenCalledWith({
      workflowId:'ugc-photo-campaign',photoAssetIds:['asset-1'],campaignTheme:'夏天的风',
    });
  });

  it('已有非终态任务时不能重复提交且保留模板与输入',async()=>{
    getGenerationJobMock.mockResolvedValue(makeSnapshot({status:'running',phase:'images',completedImages:1,totalImages:2}));
    const {result}=setup();
    act(()=>result.current.setPrompt('贵阳的12种美食'));
    await act(async()=>result.current.submit());
    await waitFor(()=>expect(result.current.busy).toBe(true));

    await act(async()=>result.current.submit());
    expect(createGenerationJobMock).toHaveBeenCalledTimes(1);
    expect(result.current.prompt).toBe('贵阳的12种美食');
    expect(result.current.selectedWorkflowId).toBe('xhs-atlas');
  });

  it('创建任务失败时向用户展示安全消息',async()=>{
    createGenerationJobMock.mockRejectedValueOnce(new ApiError(0,'任务创建失败，请稍后重试'));
    const {result}=setup();
    act(()=>result.current.setPrompt('贵阳的12种美食'));
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('任务创建失败，请稍后重试');
  });

  it('不会把非业务异常原文直接暴露给用户',async()=>{
    const {result}=setup({uploadReferenceFiles:vi.fn()
      .mockRejectedValueOnce(new Error('internal stack detail'))
      .mockResolvedValue([ASSET])});
    const file=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('贵阳的12种美食');
      result.current.addFiles([file]);
    });
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('图片上传失败，请稍后重试。');

    createGenerationJobMock.mockRejectedValueOnce(new Error('internal stack detail'));
    act(()=>result.current.setPrompt('贵阳的13种美食'));
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('素材生成失败，请稍后重试。');
  });
});
