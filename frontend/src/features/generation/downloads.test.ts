import JSZip from 'jszip';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {WorkflowPageBase} from '../../../../shared/types';
import {makeGenerateResult,makeOriginalIpResult,makeXhsAtlasResult} from '../../test/fixtures';
import {
  buildPackage,
  copyText,
  DownloadError,
  downloadPackage,
  downloadPage,
  IMAGE_FETCH_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  MAX_PACKAGE_IMAGE_BYTES,
  MAX_PACKAGE_PAGES,
} from './downloads';

function blobResponse(content:string,status=200):Response{
  return new Response(new Blob([content],{type:'image/svg+xml'}),{
    status,
    headers:{'Content-Type':'image/svg+xml'},
  });
}

describe('generation downloads',()=>{
  const createObjectURL=vi.fn(()=>'blob:download');
  const revokeObjectURL=vi.fn();
  const click=vi.fn<(filename:string)=>void>();

  beforeEach(()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>());
    vi.stubGlobal('URL',{
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){
      click(this.download);
    });
  });

  afterEach(()=>{
    expect(document.querySelectorAll('a')).toHaveLength(0);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    click.mockClear();
    vi.useRealTimers();
  });

  it('copies text with the clipboard api',async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});

    await expect(copyText('待复制文案')).resolves.toEqual({ok:true});
    expect(writeText).toHaveBeenCalledWith('待复制文案');
  });

  it('returns a safe result when clipboard is missing or rejects',async()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
    await expect(copyText('文案')).resolves.toEqual({
      ok:false,
      message:'当前浏览器不支持复制，请手动选择文案',
    });

    Object.defineProperty(navigator,'clipboard',{
      configurable:true,
      value:{writeText:vi.fn().mockRejectedValue(new Error('permission details'))},
    });
    await expect(copyText('文案')).resolves.toEqual({
      ok:false,
      message:'复制失败，请手动选择文案',
    });
  });

  it('downloads a successful page blob and always releases browser resources',async()=>{
    const page=makeGenerateResult({pageCount:1}).pages[0];
    vi.mocked(fetch).mockResolvedValue(blobResponse('image'));

    await downloadPage(page);

    expect(fetch).toHaveBeenCalledWith(page.imageUrl,{
      signal:expect.any(AbortSignal),
    });
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledWith(page.filename);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('releases the page object url even when the browser click fails',async()=>{
    const page=makeGenerateResult({pageCount:1}).pages[0];
    vi.mocked(fetch).mockResolvedValue(blobResponse('image'));
    click.mockImplementationOnce(()=>{throw new Error('browser blocked download');});

    await expect(downloadPage(page)).rejects.toThrow('browser blocked download');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('uses a safe basename for a page download',async()=>{
    const page={...makeGenerateResult({pageCount:1}).pages[0],filename:'../private/poster.svg'};
    vi.mocked(fetch).mockResolvedValue(blobResponse('image'));

    await downloadPage(page);

    expect(click).toHaveBeenCalledWith('poster.svg');
  });

  it.each([
    [{...makeGenerateResult({pageCount:1}).pages[0],status:'failed' as const},'当前图片尚未生成成功'],
    [{...makeGenerateResult({pageCount:1}).pages[0],imageUrl:undefined},'当前图片尚未生成成功'],
  ])('rejects unavailable pages without creating a fake download',async(page,message)=>{
    await expect(downloadPage(page)).rejects.toEqual(expect.objectContaining({
      name:'DownloadError',
      message,
    }));
    expect(fetch).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('fails safely when the page image request is unsuccessful',async()=>{
    vi.mocked(fetch).mockResolvedValue(blobResponse('private stack',502));

    await expect(downloadPage(makeGenerateResult({pageCount:1}).pages[0]))
      .rejects.toMatchObject({status:502,message:'图片下载失败，请稍后重试'});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('builds a partial package with exact copy and successful dynamic filenames',async()=>{
    const result=makeGenerateResult({failedIndexes:[1],pageCount:3});
    vi.mocked(fetch)
      .mockResolvedValueOnce(blobResponse('image-one'))
      .mockResolvedValueOnce(blobResponse('image-three'));

    const blob=await buildPackage(result);
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual([
      'original-ip-1.svg',
      'original-ip-3.svg',
      '文案.txt',
    ].sort());
    await expect(zip.file('文案.txt')?.async('string')).resolves.toBe(
      '标题：贵州夏季避暑宣传\n正文：面向年轻游客的夏季避暑内容。\n标签：贵州旅行、夏季避暑',
    );
    expect(fetch).toHaveBeenNthCalledWith(1,result.pages[0].imageUrl,{
      signal:expect.any(AbortSignal),
    });
    expect(fetch).toHaveBeenNthCalledWith(2,result.pages[2].imageUrl,{
      signal:expect.any(AbortSignal),
    });
  });

  it('builds an xhs-atlas package with release copy and list manifest',async()=>{
    const result=makeXhsAtlasResult({pageCount:0});

    const zip=await JSZip.loadAsync(await (await buildPackage(result)).arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual(['发布文案.txt','清单.json'].sort());
    await expect(zip.file('发布文案.txt')?.async('string')).resolves.toBe(
      '候选标题：\n贵阳美食图鉴来了\n12种贵阳必吃美食\n收藏这份贵阳美食清单\n正文：按场景整理的贵阳美食清单正文。\n标签：#贵阳美食、#干货分享',
    );
    await expect(JSON.parse(await zip.file('清单.json')!.async('string'))).toEqual(result.list);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('builds an xhs-atlas package with the cover and successful content pages',async()=>{
    const result=makeXhsAtlasResult({failedIndexes:[2],pageCount:3});
    vi.mocked(fetch)
      .mockResolvedValueOnce(blobResponse('cover'))
      .mockResolvedValueOnce(blobResponse('content'));

    const zip=await JSZip.loadAsync(await (await buildPackage(result)).arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual([
      'xhs-atlas-1.svg',
      'xhs-atlas-2.svg',
      '发布文案.txt',
      '清单.json',
    ].sort());
    expect(fetch).toHaveBeenNthCalledWith(1,result.pages[0].imageUrl,{
      signal:expect.any(AbortSignal),
    });
    expect(fetch).toHaveBeenNthCalledWith(2,result.pages[1].imageUrl,{
      signal:expect.any(AbortSignal),
    });
  });

  it('includes the overview image in an original-ip package when present',async()=>{
    const result=makeOriginalIpResult({pageCount:5});
    vi.mocked(fetch).mockImplementation(async()=>blobResponse('image'));

    const zip=await JSZip.loadAsync(await (await buildPackage(result)).arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual([
      'original-ip-1.svg',
      'original-ip-2.svg',
      'original-ip-3.svg',
      'original-ip-4.svg',
      'original-ip-overview-1.svg',
      '文案.txt',
    ].sort());
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('still creates a copy package when every image failed',async()=>{
    const result=makeGenerateResult({failedIndexes:[0,1],pageCount:2});

    const zip=await JSZip.loadAsync(await (await buildPackage(result)).arrayBuffer());

    expect(Object.keys(zip.files)).toEqual(['文案.txt']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects the whole package safely when a successful image cannot be fetched',async()=>{
    vi.mocked(fetch).mockResolvedValue(blobResponse('provider stack',503));

    await expect(buildPackage(makeGenerateResult({pageCount:1})))
      .rejects.toMatchObject({status:503,message:'素材包图片下载失败，请稍后重试'});
  });

  it('rejects a package when a successful page has no image url',async()=>{
    const result=makeGenerateResult({pageCount:1});
    result.pages[0]={...result.pages[0],imageUrl:undefined};

    await expect(buildPackage(result)).rejects.toMatchObject({
      status:0,
      message:'素材包图片下载失败，请稍后重试',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('normalizes dangerous package names without overwriting copy or duplicate images',async()=>{
    const result=makeGenerateResult({pageCount:4});
    result.pages[0]={...result.pages[0],filename:'文案.txt'};
    result.pages[1]={...result.pages[1],filename:'../poster.svg'};
    result.pages[2]={...result.pages[2],filename:'poster.svg'};
    result.pages[3]={...result.pages[3],filename:'   '};
    vi.mocked(fetch).mockImplementation(async()=>blobResponse('image'));

    const zip=await JSZip.loadAsync(await (await buildPackage(result)).arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual([
      '图片-4',
      'poster-2.svg',
      'poster.svg',
      '文案-2.txt',
      '文案.txt',
    ].sort());
  });

  it('rejects html responses instead of packaging them as images',async()=>{
    vi.mocked(fetch).mockResolvedValue(new Response('<html>login</html>',{
      status:200,
      headers:{'Content-Type':'text/html'},
    }));

    await expect(buildPackage(makeGenerateResult({pageCount:1}))).rejects.toMatchObject({
      message:'素材包图片下载失败，请稍后重试',
    });
  });

  it('rejects an image after reading a blob larger than the per-file limit',async()=>{
    const oversized=new Blob(['x'],{type:'image/svg+xml'});
    Object.defineProperty(oversized,'size',{value:MAX_IMAGE_BYTES+1});
    // 无 body 的响应走 response.blob() 兜底路径，验证完整读取后的超限复核。
    const fetched=new Response(null,{headers:{'Content-Type':'image/svg+xml'}});
    vi.spyOn(fetched,'blob').mockResolvedValue(oversized);
    vi.mocked(fetch).mockResolvedValue(fetched);

    await expect(downloadPage(makeGenerateResult({pageCount:1}).pages[0])).rejects.toMatchObject({
      message:'图片下载失败，请稍后重试',
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('aborts image downloads that exceed the timeout',async()=>{
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_input,init)=>new Promise<Response>((_resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>{
        reject(new DOMException('aborted','AbortError'));
      });
    }));

    const pending=downloadPage(makeGenerateResult({pageCount:1}).pages[0]);
    const rejection=expect(pending).rejects.toMatchObject({
      status:0,
      message:'图片下载失败，请稍后重试',
    });
    await vi.advanceTimersByTimeAsync(IMAGE_FETCH_TIMEOUT_MS);

    await rejection;
  });

  it('rejects a package after the total image size limit is reached',async()=>{
    const result=makeGenerateResult({pageCount:9});
    const sizedBlob=new Blob(['x'],{type:'image/svg+xml'});
    Object.defineProperty(sizedBlob,'size',{value:MAX_IMAGE_BYTES});
    vi.mocked(fetch).mockImplementation(async()=>{
      const fetched=new Response(null,{headers:{'Content-Type':'image/svg+xml'}});
      vi.spyOn(fetched,'blob').mockResolvedValue(sizedBlob);
      return fetched;
    });

    await expect(buildPackage(result)).rejects.toMatchObject({
      message:'素材包过大，无法下载',
    });
    expect(fetch).toHaveBeenCalledTimes(Math.floor(MAX_PACKAGE_IMAGE_BYTES/MAX_IMAGE_BYTES)+1);
  });

  it('rejects packages beyond the successful page count limit before fetching',async()=>{
    const result=makeGenerateResult({pageCount:MAX_PACKAGE_PAGES+1});

    await expect(buildPackage(result)).rejects.toMatchObject({
      message:'素材包图片过多，无法下载',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloads a stable package filename and revokes its object url',async()=>{
    const result=makeGenerateResult({pageCount:0});

    await downloadPackage(result);

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledWith('文旅素材-request-fixture.zip');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('uses a typed error for invalid page input',async()=>{
    const page={status:'failed'} as WorkflowPageBase;
    const error=await downloadPage(page).catch((reason:unknown)=>reason);
    expect(error).toBeInstanceOf(DownloadError);
  });
});
