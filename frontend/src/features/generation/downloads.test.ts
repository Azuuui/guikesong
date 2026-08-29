import JSZip from 'jszip';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {GeneratedPage} from '../../../../shared/types';
import {makeGenerateResponse} from '../../test/fixtures';
import {
  buildPackage,
  copyText,
  DownloadError,
  downloadPackage,
  downloadPage,
} from './downloads';

function blobResponse(content:string,status=200):Response{
  return new Response(new Blob([content],{type:'image/svg+xml'}),{status});
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
    const page=makeGenerateResponse({pageCount:1}).pages[0];
    vi.mocked(fetch).mockResolvedValue(blobResponse('image'));

    await downloadPage(page);

    expect(fetch).toHaveBeenCalledWith(page.imageUrl);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledWith(page.filename);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('releases the page object url even when the browser click fails',async()=>{
    const page=makeGenerateResponse({pageCount:1}).pages[0];
    vi.mocked(fetch).mockResolvedValue(blobResponse('image'));
    click.mockImplementationOnce(()=>{throw new Error('browser blocked download');});

    await expect(downloadPage(page)).rejects.toThrow('browser blocked download');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it.each([
    [{...makeGenerateResponse({pageCount:1}).pages[0],status:'failed' as const},'当前图片尚未生成成功'],
    [{...makeGenerateResponse({pageCount:1}).pages[0],imageUrl:undefined},'当前图片尚未生成成功'],
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

    await expect(downloadPage(makeGenerateResponse({pageCount:1}).pages[0]))
      .rejects.toMatchObject({status:502,message:'图片下载失败，请稍后重试'});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('builds a partial package with exact copy and successful dynamic filenames',async()=>{
    const response=makeGenerateResponse({failedIndexes:[1]});
    vi.mocked(fetch)
      .mockResolvedValueOnce(blobResponse('image-one'))
      .mockResolvedValueOnce(blobResponse('image-three'));

    const blob=await buildPackage(response);
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual([
      'ip-image-1.svg',
      'ip-image-3.svg',
      '文案.txt',
    ].sort());
    await expect(zip.file('文案.txt')?.async('string')).resolves.toBe(
      '标题：贵州夏季避暑宣传\n正文：面向年轻游客的夏季避暑内容。\n标签：贵州旅行、夏季避暑',
    );
    expect(fetch).toHaveBeenNthCalledWith(1,response.pages[0].imageUrl);
    expect(fetch).toHaveBeenNthCalledWith(2,response.pages[2].imageUrl);
  });

  it('still creates a copy package when every image failed',async()=>{
    const response=makeGenerateResponse({failedIndexes:[0,1],pageCount:2});

    const zip=await JSZip.loadAsync(await (await buildPackage(response)).arrayBuffer());

    expect(Object.keys(zip.files)).toEqual(['文案.txt']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects the whole package safely when a successful image cannot be fetched',async()=>{
    vi.mocked(fetch).mockResolvedValue(blobResponse('provider stack',503));

    await expect(buildPackage(makeGenerateResponse({pageCount:1})))
      .rejects.toMatchObject({status:503,message:'素材包图片下载失败，请稍后重试'});
  });

  it('rejects a package when a successful page has no image url',async()=>{
    const response=makeGenerateResponse({pageCount:1});
    response.pages[0]={...response.pages[0],imageUrl:undefined};

    await expect(buildPackage(response)).rejects.toMatchObject({
      status:0,
      message:'素材包图片下载失败，请稍后重试',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloads a stable package filename and revokes its object url',async()=>{
    const response=makeGenerateResponse({pageCount:0});

    await downloadPackage(response);

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledWith('文旅素材-request-fixture.zip');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('uses a typed error for invalid page input',async()=>{
    const page={status:'failed'} as GeneratedPage;
    const error=await downloadPage(page).catch((reason:unknown)=>reason);
    expect(error).toBeInstanceOf(DownloadError);
  });
});
