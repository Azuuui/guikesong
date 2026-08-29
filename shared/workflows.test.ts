import {describe, expect, it} from 'vitest';
import {parseGenerateRequest} from './workflowSchemas';
import {WORKFLOW_IDS} from './workflows';

describe('parseGenerateRequest', () => {
  it('解析合法的原创 IP 请求', () => {
    expect(parseGenerateRequest({
      workflowId: 'original-ip',
      ipProfileId: 'profile-1',
      productAssetId: 'asset-1',
      productDescription: '米白陶瓷杯',
    })).toMatchObject({workflowId: 'original-ip'});
  });

  it('解析合法的小红书图鉴请求', () => {
    expect(parseGenerateRequest({
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: [],
    })).toMatchObject({workflowId: 'xhs-atlas', topic: '贵阳的12种美食'});
  });

  it.each(['两个贵州景点', '十二种贵阳美食', '三十六处打卡地'])('识别中文图鉴数量：%s', topic => {
    expect(parseGenerateRequest({
      workflowId: 'xhs-atlas',
      topic,
      referenceAssetIds: [],
    })).toMatchObject({workflowId: 'xhs-atlas', topic});
  });

  it('选题无数字时报错', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'xhs-atlas',
      topic: '贵阳美食',
      referenceAssetIds: [],
    })).toThrow('选题需包含数量');
  });

  it('选题数量小于 2 时报错', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'xhs-atlas',
      topic: '贵阳的1种美食',
      referenceAssetIds: [],
    })).toThrow('选题数量至少为 2');
    expect(() => parseGenerateRequest({
      workflowId: 'xhs-atlas',
      topic: '一个贵州景点',
      referenceAssetIds: [],
    })).toThrow('选题数量至少为 2');
  });

  it('图鉴参考图最多 4 张', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: ['a', 'b', 'c', 'd', 'e'],
    })).toThrow('参考图最多 4 张');
  });

  it('产品描述不能为空', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'original-ip',
      ipProfileId: 'profile-1',
      productAssetId: 'asset-1',
      productDescription: '   ',
    })).toThrow('请输入产品描述');
  });

  it('产品描述不超过 500 字', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'original-ip',
      ipProfileId: 'profile-1',
      productAssetId: 'asset-1',
      productDescription: '茶'.repeat(501),
    })).toThrow('产品描述不超过 500 字');
  });

  it('IP 与产品资产 ID 必填', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'original-ip',
      ipProfileId: '',
      productAssetId: 'asset-1',
      productDescription: '米白陶瓷杯',
    })).toThrow('IP 档案或产品图缺失');
  });

  it('未知 workflowId 报错', () => {
    expect(() => parseGenerateRequest({workflowId: 'unknown'})).toThrow('未知工作流');
    expect(() => parseGenerateRequest(null)).toThrow('未知工作流');
  });

  it('只暴露四个工作流 ID', () => {
    expect([...WORKFLOW_IDS]).toEqual(['original-ip', 'xhs-atlas', 'travel-guide', 'ugc-photo-campaign']);
  });
});

describe('parseGenerateRequest: travel-guide', () => {
  it('解析合法的目的地请求（城市 / 景点 / 城市+景点）', () => {
    expect(parseGenerateRequest({workflowId: 'travel-guide', destination: '成都'}))
      .toMatchObject({workflowId: 'travel-guide', destination: '成都'});
    expect(parseGenerateRequest({workflowId: 'travel-guide', destination: ' 故宫 '}))
      .toMatchObject({destination: '故宫'});
    expect(parseGenerateRequest({workflowId: 'travel-guide', destination: '杭州西湖'}))
      .toMatchObject({destination: '杭州西湖'});
  });

  it('空目的地与超长目的地报错', () => {
    expect(() => parseGenerateRequest({workflowId: 'travel-guide', destination: '  '}))
      .toThrow('请输入目的地');
    expect(() => parseGenerateRequest({workflowId: 'travel-guide', destination: '超'.repeat(31)}))
      .toThrow('目的地不超过 30 字');
  });

  it('范围过大的目的地报错（国家 / 大区 / 星球）', () => {
    for (const destination of ['中国', '全国', '世界', '亚洲', '地球', '宇宙']) {
      expect(() => parseGenerateRequest({workflowId: 'travel-guide', destination}))
        .toThrow('目的地范围过大');
    }
  });

  it('纯数字／符号显然不是地点', () => {
    expect(() => parseGenerateRequest({workflowId: 'travel-guide', destination: '12345'}))
      .toThrow('请输入一个具体的目的地');
    expect(() => parseGenerateRequest({workflowId: 'travel-guide', destination: '!!! ???'}))
      .toThrow('请输入一个具体的目的地');
  });

  it('额外字段被拒绝', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'travel-guide',
      destination: '成都',
      referenceAssetIds: [],
    })).toThrow('未知字段');
  });
});

describe('parseGenerateRequest: ugc-photo-campaign', () => {
  it('解析合法请求：照片必填，主题与昵称可选', () => {
    expect(parseGenerateRequest({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1', 'asset-2'],
    })).toMatchObject({workflowId: 'ugc-photo-campaign', photoAssetIds: ['asset-1', 'asset-2']});

    expect(parseGenerateRequest({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1', 'asset-2'],
      campaignTheme: '夏日出游摄影征集',
      photoCredits: ['@山间清风', ''],
    })).toMatchObject({
      campaignTheme: '夏日出游摄影征集',
      photoCredits: ['@山间清风', ''],
    });
  });

  it('空主题规范化为 undefined', () => {
    const parsed = parseGenerateRequest({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1'],
      campaignTheme: '   ',
    }) as {campaignTheme?: string};
    expect(parsed.campaignTheme).toBeUndefined();
  });

  it('照片数量必须为 1～7 张', () => {
    expect(() => parseGenerateRequest({workflowId: 'ugc-photo-campaign', photoAssetIds: []}))
      .toThrow('请上传 1～7 张投稿照片');
    expect(() => parseGenerateRequest({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: Array.from({length: 8}, (_, index) => `asset-${index + 1}`),
    })).toThrow('投稿照片最多 7 张');
  });

  it('昵称数量需与照片数量一致', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1', 'asset-2'],
      photoCredits: ['@只有一张'],
    })).toThrow('投稿昵称数量需与照片数量一致');
  });

  it('主题与昵称超长报错', () => {
    expect(() => parseGenerateRequest({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1'],
      campaignTheme: '夏'.repeat(51),
    })).toThrow('活动主题不超过 50 字');
    expect(() => parseGenerateRequest({
      workflowId: 'ugc-photo-campaign',
      photoAssetIds: ['asset-1'],
      photoCredits: ['@'.repeat(31)],
    })).toThrow('投稿昵称不超过 30 字');
  });
});
