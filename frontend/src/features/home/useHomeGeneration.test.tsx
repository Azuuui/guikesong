import {act,renderHook} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import type {ReferenceAsset,WorkflowId} from '../../../../shared/types';
import {makeOriginalIpResult,makeTravelGuideResult,makeUgcPhotoCampaignResult,makeXhsAtlasResult} from '../../test/fixtures';
import {useHomeGeneration,type HomeGenerationDependencies} from './useHomeGeneration';

const ASSET:ReferenceAsset={
  assetId:'asset-1',url:'/asset-1',originalName:'ref.png',mediaType:'image/png',size:3,createdAt:'2026-08-29T00:00:00.000Z',
};

function setup(overrides:Partial<HomeGenerationDependencies>={},initialWorkflowId:WorkflowId='xhs-atlas'){
  const navigate=vi.fn();
  const dependencies:HomeGenerationDependencies={
    createObjectURL:vi.fn(()=>`blob:preview-${Math.random()}`),
    revokeObjectURL:vi.fn(),
    getActiveIpProfile:vi.fn().mockResolvedValue(null),
    uploadReferenceFiles:vi.fn().mockResolvedValue([ASSET]),
    generateAssets:vi.fn().mockResolvedValue(makeXhsAtlasResult()),
    saveResult:vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const hook=renderHook(()=>useHomeGeneration({dependencies,initialWorkflowId,navigate}));
  return {navigate,dependencies,...hook};
}

describe('useHomeGeneration',()=>{
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

  it('图鉴从主页上传、生成、保存并进入结果页',async()=>{
    const generated=makeXhsAtlasResult({requestId:'request-home'});
    const {result,dependencies,navigate}=setup({generateAssets:vi.fn().mockResolvedValue(generated)});
    const file=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('贵阳的12种美食');
      result.current.addFiles([file]);
    });
    await act(async()=>result.current.submit());

    expect(dependencies.uploadReferenceFiles).toHaveBeenCalledWith([file],expect.any(AbortSignal));
    expect(dependencies.generateAssets).toHaveBeenCalledWith({
      workflowId:'xhs-atlas',topic:'贵阳的12种美食',referenceAssetIds:['asset-1'],
    },expect.any(AbortSignal));
    expect(dependencies.saveResult).toHaveBeenCalledWith(expect.objectContaining({workflowId:'xhs-atlas',result:generated}));
    expect(navigate).toHaveBeenCalledWith('/results/request-home',expect.objectContaining({state:expect.objectContaining({result:generated})}));
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
  });

  it('原创 IP 已锁定时直接从主页生成',async()=>{
    const generated=makeOriginalIpResult({requestId:'request-ip'});
    const {result,dependencies}=setup({
      getActiveIpProfile:vi.fn().mockResolvedValue({
        ipProfileId:'profile-1',version:1,name:'苗苗',referenceImageUrl:'/ip.png',description:'苗族IP',status:'locked',
      }),
      generateAssets:vi.fn().mockResolvedValue(generated),
    },'original-ip');
    const file=new File(['product'],'product.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('苗绣纹样马克杯');
      result.current.addFiles([file]);
    });
    await act(async()=>result.current.submit());
    expect(dependencies.generateAssets).toHaveBeenCalledWith({
      workflowId:'original-ip',ipProfileId:'profile-1',productAssetId:'asset-1',productDescription:'苗绣纹样马克杯',
    },expect.any(AbortSignal));
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

  it('手绘攻略校验目的地且拒绝参考图，合法目的地直接生成',async()=>{
    const generated=makeTravelGuideResult({requestId:'request-guide'});
    const {result,dependencies,navigate}=setup({generateAssets:vi.fn().mockResolvedValue(generated)},'travel-guide');

    act(()=>result.current.setPrompt('中国'));
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('目的地范围过大，请输入城市或景点，如"成都"或"杭州西湖"');
    expect(dependencies.generateAssets).not.toHaveBeenCalled();

    const file=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('成都');
      result.current.addFiles([file]);
    });
    expect(result.current.error).toBe('手绘攻略不需要参考图片，直接输入目的地即可。');
    expect(result.current.attachments).toHaveLength(0);
    expect(dependencies.uploadReferenceFiles).not.toHaveBeenCalled();

    await act(async()=>result.current.submit());
    expect(dependencies.generateAssets).toHaveBeenCalledWith({
      workflowId:'travel-guide',destination:'成都',
    },expect.any(AbortSignal));
    expect(dependencies.saveResult).toHaveBeenCalledWith(expect.objectContaining({workflowId:'travel-guide',result:generated}));
    expect(navigate).toHaveBeenCalledWith('/results/request-guide',expect.objectContaining({state:expect.objectContaining({result:generated})}));
  });

  it('游客返图校验照片数量并上传后生成',async()=>{
    const generated=makeUgcPhotoCampaignResult({requestId:'request-ugc'});
    const {result,dependencies}=setup({generateAssets:vi.fn().mockResolvedValue(generated)},'ugc-photo-campaign');

    act(()=>result.current.setPrompt('夏天的风'));
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('游客返图需要至少 1 张照片。');
    expect(dependencies.generateAssets).not.toHaveBeenCalled();

    const photo=new File(['photo'],'photo.png',{type:'image/png'});
    act(()=>result.current.addFiles([photo]));
    await act(async()=>result.current.submit());
    expect(dependencies.uploadReferenceFiles).toHaveBeenCalledWith([photo],expect.any(AbortSignal));
    expect(dependencies.generateAssets).toHaveBeenCalledWith({
      workflowId:'ugc-photo-campaign',photoAssetIds:['asset-1'],campaignTheme:'夏天的风',
    },expect.any(AbortSignal));
    expect(dependencies.saveResult).toHaveBeenCalledWith(expect.objectContaining({workflowId:'ugc-photo-campaign',result:generated}));
  });

  it('不会把非业务异常原文直接暴露给用户',async()=>{
    const {result}=setup({uploadReferenceFiles:vi.fn().mockRejectedValue(new Error('internal stack detail'))});
    const file=new File(['image'],'ref.png',{type:'image/png'});
    act(()=>{
      result.current.setPrompt('贵阳的12种美食');
      result.current.addFiles([file]);
    });
    await act(async()=>result.current.submit());
    expect(result.current.error).toBe('图片上传失败，请稍后重试。');
  });
});
