import {describe, expect, it} from 'vitest';
import * as contractsModule from './types';
import {WORKFLOW_IDS, type ReferenceAsset} from './types';
import {
  isGenerationJobSnapshot,
  type GenerationJobSnapshot,
} from './generationJobs';

type PublicContracts = typeof contractsModule;

// 旧四模板合同已删除：以下类型访问必须在编译期失败。
// @ts-expect-error 旧模板 ID 合同已删除
type LegacyTemplateIds = PublicContracts['TEMPLATE_IDS'];
// @ts-expect-error 旧响应合同已删除
type LegacyGenerateResponse = PublicContracts['GenerateResponse'];
// @ts-expect-error 旧页面合同已删除
type LegacyGeneratedPage = PublicContracts['GeneratedPage'];

type LegacyContracts = LegacyTemplateIds | LegacyGenerateResponse | LegacyGeneratedPage;

function legacyContractsValue(): LegacyContracts | undefined {
  return undefined;
}

describe('共享契约', () => {
  it('只暴露四工作流 ID，旧四模板合同不再公开', () => {
    expect([...WORKFLOW_IDS]).toEqual(['original-ip', 'xhs-atlas', 'travel-guide', 'ugc-photo-campaign']);
    expect(legacyContractsValue()).toBeUndefined();

    const exportedNames = Object.keys(contractsModule);
    expect(exportedNames).not.toContain('TEMPLATE_IDS');
    expect(exportedNames).not.toContain('TEMPLATE_LABELS');
    expect(exportedNames).not.toContain('GenerateResponse');
    expect(exportedNames).not.toContain('GeneratedPage');
    expect(exportedNames).not.toContain('validateRequest');
    for (const legacyId of ['ip-image', 'travel-cards', 'scenery-collage', 'people-collage']) {
      expect(exportedNames).not.toContain(legacyId);
    }
  });

  it('ReferenceAsset 保持稳定公开字段', () => {
    const asset: ReferenceAsset = {
      assetId: 'asset-1',
      url: '/api/reference-assets/asset-1',
      originalName: 'figure.png',
      mediaType: 'image/png',
      size: 1024,
      createdAt: '2026-08-29T00:00:00.000Z',
    };
    expect(asset.assetId).toBe('asset-1');
    expect(Object.keys(asset).sort()).toEqual(
      ['assetId', 'createdAt', 'mediaType', 'originalName', 'size', 'url'].sort(),
    );
  });
});

const JOB_NOW = '2026-08-30T00:00:00.000Z';

/** 构造合法运行态任务快照，用 overrides 制造非法变体。 */
function jobSnapshot(overrides: Record<string, unknown> = {}): GenerationJobSnapshot {
  return {
    jobId: 'job-1',
    workflowId: 'xhs-atlas',
    status: 'running',
    phase: 'images',
    completedImages: 1,
    totalImages: 2,
    createdAt: JOB_NOW,
    updatedAt: JOB_NOW,
    result: null,
    error: null,
    ...overrides,
  } as GenerationJobSnapshot;
}

describe('后台生成任务合同', () => {
  it('接受合法运行态快照', () => {
    expect(isGenerationJobSnapshot(jobSnapshot())).toBe(true);
    expect(isGenerationJobSnapshot(jobSnapshot({phase: 'preparing', completedImages: 0, totalImages: 0}))).toBe(true);
    expect(isGenerationJobSnapshot(jobSnapshot({phase: 'finalizing', completedImages: 2, totalImages: 2}))).toBe(true);
  });

  it('接受终态成功并要求 workflowId 一致的结果对象', () => {
    const result = {requestId: 'job-1', workflowId: 'xhs-atlas', status: 'succeeded', pages: [], warnings: []};
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'succeeded', phase: 'finalizing', result}))).toBe(true);
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'partial', phase: 'finalizing', result}))).toBe(true);
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'succeeded', result: null}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'partial', result: 42}))).toBe(false);
    // 结果对象存在但 workflowId 与任务不一致，视为污染响应。
    expect(isGenerationJobSnapshot(jobSnapshot({
      status: 'succeeded',
      result: {...result, workflowId: 'original-ip'},
    }))).toBe(false);
  });

  it('失败终态必须携带安全错误对象', () => {
    const error = {code: 'INTERNAL_ERROR', message: '生成失败，请稍后重试'};
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'failed', error}))).toBe(true);
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'failed', error: null}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'failed', error: {code: '', message: 'x'}}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'failed', error: {code: 'x'}}))).toBe(false);
    // 非终态不允许携带错误。
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'running', error}))).toBe(false);
  });

  it('拒绝非法枚举、计数与时间戳', () => {
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'paused'}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({status: 'succeeded', result: null, phase: 'unknown'}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({workflowId: 'ip-image'}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({jobId: ''}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({completedImages: 3, totalImages: 2}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({completedImages: -1, totalImages: 2}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({completedImages: 1.5, totalImages: 2}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({completedImages: '1', totalImages: 2}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({createdAt: ''}))).toBe(false);
    expect(isGenerationJobSnapshot(jobSnapshot({updatedAt: 'not-a-time'}))).toBe(false);
  });

  it('拒绝非对象输入', () => {
    expect(isGenerationJobSnapshot(null)).toBe(false);
    expect(isGenerationJobSnapshot(undefined)).toBe(false);
    expect(isGenerationJobSnapshot('job')).toBe(false);
    expect(isGenerationJobSnapshot([])).toBe(false);
  });
});
