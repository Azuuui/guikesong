import {afterEach,describe,expect,it,vi} from 'vitest';
import type {OriginalIpResult,XhsAtlasResult} from '../../../../shared/workflows';
import type {GenerateRequest} from '../../../../shared/types';
import {
  ApiError,
  createIpProfile,
  generateAssets,
  getActiveIpProfile,
  lockIpProfile,
  uploadReferenceFiles,
} from './api';

function jsonResponse(body:unknown,status=200):Response{
  return new Response(JSON.stringify(body),{
    status,
    headers:{'Content-Type':'application/json'},
  });
}

function makeOriginalIpResult():OriginalIpResult{
  return {
    requestId:'request-ip',
    workflowId:'original-ip',
    status:'succeeded',
    copy:{title:'上新预告',body:'正文',tags:['#文创']},
    ipProfileId:'profile-1',
    ipProfileVersion:1,
    pages:[
      {id:'page-1',role:'brand-cover',filename:'cover.png',status:'succeeded',imageUrl:'/api/generated-assets/cover.png',alt:'品牌主视觉封面图'},
      {id:'page-2',role:'identity-system',filename:'identity.png',status:'succeeded',imageUrl:'/api/generated-assets/identity.png',alt:'品牌识别与 IP 系统图'},
      {id:'page-3',role:'product-system',filename:'product.png',status:'succeeded',imageUrl:'/api/generated-assets/product.png',alt:'商品与包装系统图'},
      {id:'page-4',role:'scene-application',filename:'scene.png',status:'failed',alt:'传播与销售场景应用图',error:'图片生成失败，请稍后重试'},
    ],
    warnings:[],
  };
}

function makeXhsAtlasResult():XhsAtlasResult{
  return {
    requestId:'request-atlas',
    workflowId:'xhs-atlas',
    status:'partial',
    copy:{titles:['标题一','标题二','标题三'],body:'正文',tags:['#干货分享','#贵阳美食']},
    topic:'贵阳的12种美食',
    list:{
      meta:{
        userTitle:'贵阳的12种美食',
        count:12,
        measureWord:'种',
        domainType:'美食盘点',
        orgDimension:'按食用场景',
        themeWord:'美食',
        fieldLabels:['怎么吃','避坑'],
        motif:'一碗热气',
        palette:'美食暖橙',
        pageSlogans:['一','二','三','四','五','六'],
      },
      cover:{titleLine1:'贵阳的',titleLine2:'12种美食',highlightWord:'12种',stickyNote:'一共12种',bottomSlogan:'收藏这份清单'},
      items:[
        {no:'01',tag:'早餐',name:'肠旺面',line1:'一',line2:'二',punch:'三',illustrationHint:'一碗肠旺面'},
        {no:'02',tag:'小吃',name:'丝娃娃',line1:'一',line2:'二',punch:'三',illustrationHint:'一张薄饼'},
      ],
    },
    pages:[
      {id:'page-cover',role:'cover',filename:'cover.png',status:'succeeded',imageUrl:'/api/generated-assets/atlas-cover.png',alt:'图鉴封面'},
      {id:'page-content-1',role:'content',filename:'content-1.png',status:'failed',alt:'图鉴正文页',error:'图片生成失败，请稍后重试'},
    ],
    warnings:['部分页面生成失败'],
  };
}

describe('generation api',()=>{
  afterEach(()=>{
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uploads every reference file as multipart files and returns assets',async()=>{
    const assets=[{
      assetId:'asset-a',
      url:'/api/reference-assets/asset-a',
      originalName:'a.png',
      mediaType:'image/png' as const,
      size:3,
      createdAt:'2026-08-29T00:00:00.000Z',
    }];
    const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({assets}));
    vi.stubGlobal('fetch',fetchMock);
    const files=[
      new File(['one'],'a.png',{type:'image/png'}),
      new File(['two'],'b.webp',{type:'image/webp'}),
    ];

    await expect(uploadReferenceFiles(files)).resolves.toEqual(assets);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe('/api/reference-assets');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    expect([...((init?.body as FormData).getAll('files'))]).toEqual(files);
  });

  it('returns an empty list without requesting when there are no files',async()=>{
    const fetchMock=vi.fn<typeof fetch>();
    vi.stubGlobal('fetch',fetchMock);

    await expect(uploadReferenceFiles([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('converts upload business errors to ApiError',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({error:'参考图最多 4 张'},400),
    ));

    const error=await uploadReferenceFiles([new File(['x'],'a.png')]).catch(
      (reason:unknown)=>reason,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({status:400,message:'参考图最多 4 张'});
  });

  it.each([
    ['non-json',new Response('<html>server failure</html>',{status:500})],
    ['empty error',jsonResponse({error:'   '},500)],
    ['server stack',jsonResponse({error:'Error: provider exploded\n    at generate (/srv/app.js:3:2)'},500)],
    ['absolute path',jsonResponse({error:'ENOENT: no such file, open /Users/private/key.json'},500)],
  ])('uses a safe upload message for %s errors',async(_label,response)=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(response));

    const error=await uploadReferenceFiles([new File(['x'],'a.png')]).catch(
      (reason:unknown)=>reason,
    );
    expect(error).toMatchObject({status:500,message:'参考图上传失败，请稍后重试'});
    expect(String((error as Error).message)).not.toContain('/srv/app.js');
  });

  it('turns network failures into a safe ApiError and keeps the cause',async()=>{
    const cause=new TypeError('fetch failed: private host');
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockRejectedValue(cause));

    const error=await uploadReferenceFiles([new File(['x'],'a.png')]).catch(
      (reason:unknown)=>reason,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({status:0,message:'网络连接失败，请稍后重试',cause});
    expect((error as Error).message).not.toContain('private host');
  });

  it('rejects malformed successful upload items with a safe ApiError',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      assets:[{
        assetId:'asset-a',
        url:'/api/reference-assets/asset-a',
        originalName:'a.png',
        mediaType:'text/html',
        size:-1,
        createdAt:'2026-08-29T00:00:00.000Z',
      }],
    })));

    await expect(uploadReferenceFiles([new File(['x'],'a.png')])).rejects.toMatchObject({
      status:200,
      message:'参考图上传失败，请稍后重试',
    });
  });

  it('posts the atlas generate request as exact JSON and returns the validated result',async()=>{
    const result=makeXhsAtlasResult();
    const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(result));
    vi.stubGlobal('fetch',fetchMock);
    const request:GenerateRequest={
      workflowId:'xhs-atlas',
      topic:'贵阳的12种美食',
      referenceAssetIds:['asset-a'],
    };

    await expect(generateAssets(request)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith('/api/generate',expect.objectContaining({
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({workflowId:'xhs-atlas',topic:'贵阳的12种美食',referenceAssetIds:['asset-a']}),
      signal:expect.any(AbortSignal),
    }));
  });

  it('returns the validated original-ip result',async()=>{
    const result=makeOriginalIpResult();
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(result)));
    const request:GenerateRequest={
      workflowId:'original-ip',
      ipProfileId:'profile-1',
      productAssetId:'asset-a',
      productDescription:'米白陶瓷杯',
    };

    await expect(generateAssets(request)).resolves.toEqual(result);
  });

  it('rejects malformed successful generation responses with a safe ApiError',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ok:true})));

    await expect(generateAssets({workflowId:'xhs-atlas',topic:'贵阳的12种美食',referenceAssetIds:[]})).rejects.toMatchObject({
      status:200,
      message:'素材生成失败，请稍后重试',
    });
  });

  it.each([
    ['missing copy titles count',()=>{
      const result=makeXhsAtlasResult() as unknown as Record<string,unknown>;
      (result.copy as Record<string,unknown>).titles=['只有两个'];
      return result;
    }],
    ['unknown page role',()=>{
      const result=makeXhsAtlasResult() as unknown as Record<string,unknown>;
      (result.pages as Array<Record<string,unknown>>)[0].role='brand-cover';
      return result;
    }],
    ['succeeded page without image url',()=>{
      const result=makeOriginalIpResult() as unknown as Record<string,unknown>;
      delete (result.pages as Array<Record<string,unknown>>)[0].imageUrl;
      return result;
    }],
    ['unknown workflow id',()=>{
      const result=makeXhsAtlasResult() as unknown as Record<string,unknown>;
      result.workflowId='legacy-template';
      return result;
    }],
  ])('runtime guard rejects %s',async(_label,build)=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(build())));

    await expect(generateAssets({workflowId:'xhs-atlas',topic:'贵阳的12种美食',referenceAssetIds:[]})).rejects.toMatchObject({
      status:200,
      message:'素材生成失败，请稍后重试',
    });
  });

  it('never exposes server errors even when the message looks readable',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({error:'上游服务暂时不可用'},503),
    ));

    await expect(generateAssets({workflowId:'xhs-atlas',topic:'贵阳的12种美食',referenceAssetIds:[]})).rejects.toMatchObject({
      status:503,
      message:'素材生成失败，请稍后重试',
    });
  });

  it('uses safe messages for generation business, stack and network errors',async()=>{
    const fetchMock=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({error:'选题需包含数量，如"贵阳的12种美食"'},400))
      .mockResolvedValueOnce(jsonResponse({error:'ProviderException: key leaked'},502))
      .mockRejectedValueOnce(new Error('token=private'));
    vi.stubGlobal('fetch',fetchMock);
    const request:GenerateRequest={workflowId:'xhs-atlas',topic:'贵阳的12种美食',referenceAssetIds:[]};

    await expect(generateAssets(request)).rejects.toMatchObject({
      status:400,
      message:'选题需包含数量，如"贵阳的12种美食"',
    });
    await expect(generateAssets(request)).rejects.toMatchObject({
      status:502,
      message:'素材生成失败，请稍后重试',
    });
    await expect(generateAssets(request)).rejects.toMatchObject({
      status:0,
      message:'网络连接失败，请稍后重试',
    });
  });

  it('returns null when no active ip profile exists',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({error:'尚未创建 IP 档案',code:'IP_PROFILE_MISSING'},404),
    ));

    await expect(getActiveIpProfile()).resolves.toBeNull();
  });

  it('returns the active ip profile',async()=>{
    const profile={
      ipProfileId:'profile-1',
      version:2,
      name:'山灵君',
      referenceImageUrl:'/api/reference-assets/ip.png',
      description:'以贵州山地云雾为灵感的守护精灵',
      status:'locked' as const,
    };
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(profile)));

    await expect(getActiveIpProfile()).resolves.toEqual(profile);
  });

  it('rejects malformed ip profiles with a safe ApiError',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      ipProfileId:'profile-1',
      version:0,
      name:'',
      referenceImageUrl:'/api/reference-assets/ip.png',
      description:'描述',
      status:'draft',
    })));

    await expect(getActiveIpProfile()).rejects.toMatchObject({
      status:200,
      message:'IP 档案读取失败，请稍后重试',
    });
  });

  it('creates an ip profile with multipart form data',async()=>{
    const profile={
      ipProfileId:'profile-1',
      version:1,
      name:'山灵君',
      referenceImageUrl:'/api/reference-assets/ip.png',
      description:'守护精灵',
      status:'draft' as const,
    };
    const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(profile,201));
    vi.stubGlobal('fetch',fetchMock);
    const file=new File(['ip'],'ip.png',{type:'image/png'});

    await expect(createIpProfile({file,name:'山灵君',description:'守护精灵'})).resolves.toEqual(profile);
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe('/api/ip-profiles');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('file')).toBe(file);
    expect((init?.body as FormData).get('name')).toBe('山灵君');
    expect((init?.body as FormData).get('description')).toBe('守护精灵');
  });

  it('locks the ip profile by id',async()=>{
    const profile={
      ipProfileId:'profile-1',
      version:1,
      name:'山灵君',
      referenceImageUrl:'/api/reference-assets/ip.png',
      description:'守护精灵',
      status:'locked' as const,
    };
    const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(profile));
    vi.stubGlobal('fetch',fetchMock);

    await expect(lockIpProfile('profile-1')).resolves.toEqual(profile);
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe('/api/ip-profiles/profile-1/lock');
    expect(init?.method).toBe('POST');
  });
});
