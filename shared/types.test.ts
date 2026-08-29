import {describe, expect, it} from 'vitest';
import * as contractsModule from './types';
import {WORKFLOW_IDS, type ReferenceAsset} from './types';

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
