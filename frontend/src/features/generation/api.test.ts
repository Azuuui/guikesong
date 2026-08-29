import {afterEach,describe,expect,it,vi} from 'vitest';
import {ApiError,generateMarketingAssets,uploadReferenceFiles} from './api';

function jsonResponse(body:unknown,status=200):Response{
  return new Response(JSON.stringify(body),{
    status,
    headers:{'Content-Type':'application/json'},
  });
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

  it('posts only the public generation fields as JSON',async()=>{
    const response={
      requestId:'request-a',
      templateId:'ip-image' as const,
      status:'succeeded' as const,
      copy:{title:'标题',body:'正文',tags:['贵州']},
      pages:[],
      warnings:[],
    };
    const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal('fetch',fetchMock);
    const request={
      templateId:'ip-image' as const,
      userPrompt:'贵州夏季避暑宣传',
      referenceAssetIds:['asset-a'],
      ignoredByContract:'secret',
    };

    await expect(generateMarketingAssets(request)).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/generate',expect.objectContaining({
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        templateId:'ip-image',
        userPrompt:'贵州夏季避暑宣传',
        referenceAssetIds:['asset-a'],
      }),
      signal:expect.any(AbortSignal),
    }));
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

  it('rejects malformed successful generation responses with a safe ApiError',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ok:true})));
    const request={templateId:'ip-image' as const,userPrompt:'贵州',referenceAssetIds:[]};

    await expect(generateMarketingAssets(request)).rejects.toMatchObject({
      status:200,
      message:'素材生成失败，请稍后重试',
    });
  });

  it('never exposes server errors even when the message looks readable',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({error:'上游服务暂时不可用'},503),
    ));
    const request={templateId:'ip-image' as const,userPrompt:'贵州',referenceAssetIds:[]};

    await expect(generateMarketingAssets(request)).rejects.toMatchObject({
      status:503,
      message:'素材生成失败，请稍后重试',
    });
  });

  it('uses safe messages for generation business, stack and network errors',async()=>{
    const fetchMock=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({error:'请输入 2-500 字需求'},400))
      .mockResolvedValueOnce(jsonResponse({error:'ProviderException: key leaked'},502))
      .mockRejectedValueOnce(new Error('token=private'));
    vi.stubGlobal('fetch',fetchMock);
    const request={templateId:'ip-image' as const,userPrompt:'贵州',referenceAssetIds:[]};

    await expect(generateMarketingAssets(request)).rejects.toMatchObject({
      status:400,
      message:'请输入 2-500 字需求',
    });
    await expect(generateMarketingAssets(request)).rejects.toMatchObject({
      status:502,
      message:'素材生成失败，请稍后重试',
    });
    await expect(generateMarketingAssets(request)).rejects.toMatchObject({
      status:0,
      message:'网络连接失败，请稍后重试',
    });
  });
});
