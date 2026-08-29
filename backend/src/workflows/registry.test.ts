import {describe, expect, it, vi} from 'vitest';
import {createWorkflowRegistry} from './registry';
import type {Workflow, WorkflowContext} from './contracts';
import type {GenerateRequest, GenerateResult} from '../../../shared/workflows';

function makeContext(): WorkflowContext {
  return {requestId: 'req-test'};
}

function makeResult(workflowId: GenerateRequest['workflowId']): GenerateResult {
  if (workflowId === 'original-ip') {
    return {
      requestId: 'req-test',
      workflowId: 'original-ip',
      status: 'succeeded',
      pages: [],
      warnings: [],
      copy: {title: 't', body: 'b', tags: []},
      ipProfileId: 'profile-1',
      ipProfileVersion: 1,
    };
  }
  return {
    requestId: 'req-test',
    workflowId: 'xhs-atlas',
    status: 'succeeded',
    pages: [],
    warnings: [],
    copy: {titles: ['t1', 't2', 't3'], body: 'b', tags: []},
    topic: '贵阳的12种美食',
    list: {
      meta: {
        userTitle: '贵阳的12种美食',
        count: 12,
        measureWord: '种',
        domainType: '美食盘点',
        orgDimension: '食用场景',
        themeWord: '美食',
        fieldLabels: ['怎么吃', '避坑'],
        motif: '一碗热气',
        palette: '暖橙',
        pageSlogans: ['一', '二', '三', '四', '五', '六'],
      },
      cover: {titleLine1: '贵阳', titleLine2: '美食', highlightWord: '美食', stickyNote: '', bottomSlogan: ''},
      items: [],
    },
  };
}

function makeWorkflow(id: GenerateRequest['workflowId']): Workflow {
  return {
    id,
    run: async (input: GenerateRequest) => makeResult(input.workflowId),
  };
}

describe('workflow registry', () => {
  it('按 ID 精确分派到对应 Workflow', async () => {
    const original = makeWorkflow('original-ip');
    const atlas = makeWorkflow('xhs-atlas');
    const registry = createWorkflowRegistry([original, atlas]);

    expect(registry.get('original-ip')).toBe(original);
    expect(registry.get('xhs-atlas')).toBe(atlas);
    expect(registry.list()).toEqual(['original-ip', 'xhs-atlas']);

    const result = await registry.get('original-ip').run({
      workflowId: 'original-ip',
      ipProfileId: 'profile-1',
      productAssetId: 'asset-1',
      productDescription: '米白陶瓷杯',
    }, makeContext());
    expect(result.workflowId).toBe('original-ip');
  });

  it('重复注册同一 workflowId 抛出业务错误', () => {
    expect(() => createWorkflowRegistry([
      makeWorkflow('original-ip'),
      makeWorkflow('original-ip'),
    ])).toThrow('重复注册');
  });

  it('未知 workflowId 抛出安全业务错误', () => {
    const registry = createWorkflowRegistry([makeWorkflow('original-ip')]);
    try {
      registry.get('not-exist');
      expect.unreachable('应当抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('未知工作流');
      expect(message).not.toMatch(/\//);
    }
  });

  it('注册第三个测试 Workflow 不需要修改现有 Workflow', async () => {
    const first = makeWorkflow('original-ip');
    const secondRun = vi.fn(makeWorkflow('xhs-atlas').run);
    const second: Workflow = {id: 'xhs-atlas', run: secondRun};

    const registry = createWorkflowRegistry([first, second]);
    expect(registry.get('original-ip')).toBe(first);

    await registry.get('xhs-atlas').run({
      workflowId: 'xhs-atlas',
      topic: '贵阳的12种美食',
      referenceAssetIds: [],
    }, makeContext());
    expect(secondRun).toHaveBeenCalledOnce();
  });
});
