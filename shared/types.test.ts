import {describe,expect,it} from 'vitest';
import {TEMPLATE_IDS,TEMPLATE_LABELS} from './types';

describe('模板名称',()=>{
  it('为四个稳定模板 ID 提供确认后的营销化名称',()=>{
    expect(TEMPLATE_IDS.map(id=>TEMPLATE_LABELS[id])).toEqual([
      'IP 宣传海报',
      '攻略种草卡',
      '景区氛围大片',
      '人物打卡大片',
    ]);
  });
});
