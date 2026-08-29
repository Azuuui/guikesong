import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {historyRepository} from './historyRepository';
import {
  captureHistoryRecord,
  HistorySaveError,
  materializeHistoryResult,
} from './resultMaterializer';
import {formatHistoryTime} from './time';
import {createDeferred,makeGenerateResult,makeHistoryRecord,makeOriginalIpResult} from '../../test/fixtures';

afterEach(()=>{
  vi.restoreAllMocks();
});

describe('historyRepository',()=>{
  beforeEach(async()=>{
    await historyRepository.clear();
  });

  it('lists records newest-first using their saved createdAt values',async()=>{
    await historyRepository.put(makeHistoryRecord(2));
    await historyRepository.put(makeHistoryRecord(0));
    await historyRepository.put(makeHistoryRecord(1));

    const records=await historyRepository.list();

    expect(records.map(({id})=>id)).toEqual(['request-2','request-1','request-0']);
    expect(records[1].createdAt).toBe('2026-08-29T05:01:00.000Z');
  });

  it('keeps only the newest 20 records',async()=>{
    for(let index=0;index<21;index+=1){
      await historyRepository.put(makeHistoryRecord(index));
    }

    const records=await historyRepository.list();

    expect(records).toHaveLength(20);
    expect(records[0].id).toBe('request-20');
    expect(records.at(-1)?.id).toBe('request-1');
  });

  it('gets, deletes and clears records',async()=>{
    const first=makeHistoryRecord(1);
    const second=makeHistoryRecord(2);
    await historyRepository.put(first);
    await historyRepository.put(second);

    expect(await historyRepository.get(first.id)).toEqual(first);
    expect(await historyRepository.get('missing')).toBeUndefined();

    await historyRepository.delete(first.id);
    expect(await historyRepository.get(first.id)).toBeUndefined();
    expect(await historyRepository.list()).toHaveLength(1);

    await historyRepository.clear();
    expect(await historyRepository.list()).toEqual([]);
  });

  it('deletes the oldest record and retries once after a quota error',async()=>{
    await historyRepository.put(makeHistoryRecord(0));
    const put=vi.spyOn(IDBObjectStore.prototype,'put');
    put.mockImplementationOnce(()=>{
      throw new DOMException('quota full','QuotaExceededError');
    });

    await historyRepository.put(makeHistoryRecord(1));

    expect((await historyRepository.list()).map(({id})=>id)).toEqual(['request-1']);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('throws HistorySaveError when the quota retry also fails',async()=>{
    const put=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{
      throw new DOMException('quota full','QuotaExceededError');
    });

    await expect(historyRepository.put(makeHistoryRecord(1))).rejects.toBeInstanceOf(HistorySaveError);
    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe('formatHistoryTime',()=>{
  const now=new Date('2026-08-29T06:00:00.000Z');

  it.each([
    ['2026-08-29T05:32:00.000Z','今天 14:32'],
    ['2026-08-28T09:06:00.000Z','昨天 18:06'],
    ['2026-08-21T01:15:00.000Z','08月21日 10:15'],
    ['2025-12-28T07:40:00.000Z','2025年12月28日 16:40'],
  ])('formats %s from the saved timestamp as %s',(createdAt,expected)=>{
    expect(formatHistoryTime(createdAt,now,'Asia/Tokyo')).toBe(expected);
  });
});

describe('history result capture and materialization',()=>{
  it('captures successful pages and reference files without changing the result',async()=>{
    const result=makeGenerateResult({failedIndexes:[1],pageCount:3});
    const original=structuredClone(result);
    const referenceBlob=new Blob(['reference'],{type:'image/png'});
    const referenceFiles=[{
      asset:{
        assetId:'asset-1',url:'/api/reference-assets/asset-1',originalName:'reference.png',
        mediaType:'image/png' as const,size:referenceBlob.size,createdAt:'2026-08-29T04:00:00.000Z',
      },
      blob:referenceBlob,
    }];
    const fetcher=vi.fn(async(url:string | URL | Request)=>
      new Response(`<svg>${String(url)}</svg>`,{headers:{'content-type':'image/svg+xml'}}),
    );

    const record=await captureHistoryRecord({
      result,
      userPrompt:'做一套贵州避暑内容',
      referenceFiles,
      createdAt:'2026-08-29T05:32:00.000Z',
      fetcher,
    });

    expect(record.id).toBe('request-fixture');
    expect(record.createdAt).toBe('2026-08-29T05:32:00.000Z');
    expect(record.referenceFiles).toEqual(referenceFiles);
    expect(record.result).toEqual(original);
    expect(result).toEqual(original);
    expect(record.pageBlobs.map(({pageId,filename,mediaType})=>({pageId,filename,mediaType}))).toEqual([
      {pageId:'page-1',filename:'original-ip-1.svg',mediaType:'image/svg+xml'},
      {pageId:'page-3',filename:'original-ip-3.svg',mediaType:'image/svg+xml'},
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses one injected creation time when createdAt is omitted',async()=>{
    const now=vi.fn(()=>new Date('2026-08-29T07:08:09.000Z'));
    const result=makeGenerateResult({pageCount:0});

    const record=await captureHistoryRecord({result,userPrompt:'测试',referenceFiles:[],now});

    expect(record.createdAt).toBe('2026-08-29T07:08:09.000Z');
    expect(now).toHaveBeenCalledTimes(1);
  });

  it('takes an immutable metadata snapshot before waiting for image capture',async()=>{
    const result=makeOriginalIpResult({pageCount:1});
    const referenceBlob=new Blob(['reference'],{type:'image/png'});
    const referenceFiles=[{
      asset:{
        assetId:'asset-before',url:'/asset-before',originalName:'before.png',
        mediaType:'image/png' as const,size:referenceBlob.size,createdAt:'2026-08-29T04:00:00.000Z',
      },
      blob:referenceBlob,
    }];
    const deferred=createDeferred<Response>();

    const capture=captureHistoryRecord({
      result,userPrompt:'测试',referenceFiles,fetcher:vi.fn(()=>deferred.promise),
    });
    result.copy.title='修改后的标题';
    result.pages[0].id='changed-page';
    result.pages[0].filename='changed.png';
    referenceFiles[0].asset.originalName='changed-reference.png';
    deferred.resolve(new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}));

    const record=await capture;

    if(record.result.workflowId!=='original-ip'){
      throw new Error('快照应为 original-ip 结果');
    }
    expect(record.result.copy.title).toBe('贵州夏季避暑宣传');
    expect(record.pageBlobs[0]).toMatchObject({pageId:'page-1',filename:'original-ip-1.svg'});
    expect(record.referenceFiles[0].asset.originalName).toBe('before.png');
  });

  it('throws a typed save error on image capture failure without damaging the result',async()=>{
    const result=makeGenerateResult();
    const original=structuredClone(result);

    await expect(captureHistoryRecord({
      result,userPrompt:'测试',referenceFiles:[],
      fetcher:vi.fn(async()=>{throw new TypeError('network failed');}),
    })).rejects.toMatchObject({name:'HistorySaveError'});
    expect(result).toEqual(original);
  });

  it('materializes successful page blobs and safely revokes each URL exactly once',()=>{
    const result=makeGenerateResult({failedIndexes:[1],pageCount:3});
    const record=makeHistoryRecord(1,result);
    record.pageBlobs=[
      {pageId:'page-1',filename:'original-ip-1.svg',mediaType:'image/svg+xml',blob:new Blob(['one'])},
      {pageId:'page-3',filename:'original-ip-3.svg',mediaType:'image/svg+xml',blob:new Blob(['three'])},
    ];
    const createObjectURL=vi.fn((_:Blob)=>`blob:page-${createObjectURL.mock.calls.length}`);
    const revokeObjectURL=vi.fn();

    const materialized=materializeHistoryResult(record,{createObjectURL,revokeObjectURL});

    expect(materialized.result.pages.map(({status,imageUrl})=>({status,imageUrl}))).toEqual([
      {status:'succeeded',imageUrl:'blob:page-1'},
      {status:'failed',imageUrl:undefined},
      {status:'succeeded',imageUrl:'blob:page-2'},
    ]);
    expect(result.pages[0].imageUrl).toBe('data:image/svg+xml,fixture-1');

    materialized.revoke();
    materialized.revoke();
    expect(revokeObjectURL.mock.calls).toEqual([['blob:page-1'],['blob:page-2']]);
  });

  it('keeps the current successful URL when no saved blob matches and never promotes a failed page',()=>{
    const result=makeGenerateResult({failedIndexes:[1]});
    const record=makeHistoryRecord(1,result);
    record.pageBlobs=[
      {pageId:'page-2',filename:'wrong.svg',mediaType:'image/svg+xml',blob:new Blob(['wrong'])},
    ];
    const createObjectURL=vi.fn(()=> 'blob:wrong');

    const materialized=materializeHistoryResult(record,{createObjectURL,revokeObjectURL:vi.fn()});

    expect(materialized.result.pages[0].imageUrl).toBe('data:image/svg+xml,fixture-1');
    expect(materialized.result.pages[1]).toMatchObject({status:'failed',imageUrl:undefined});
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
