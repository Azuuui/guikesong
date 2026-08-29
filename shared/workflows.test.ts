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

  it('只暴露两个工作流 ID', () => {
    expect([...WORKFLOW_IDS]).toEqual(['original-ip', 'xhs-atlas']);
  });
});
