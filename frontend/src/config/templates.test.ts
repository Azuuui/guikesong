import {describe, expect, it} from 'vitest';
import {TEMPLATE_CONFIGS} from './templates';

describe('TEMPLATE_CONFIGS', () => {
  it('四个模板使用正式示例封面而不是粒子背景', () => {
    const expectedFiles = new Map([
      ['original-ip', 'original-ip-product.webp'],
      ['xhs-atlas', 'xhs-atlas.webp'],
      ['travel-guide', 'travel-guide.webp'],
      ['ugc-photo-campaign', 'ugc-photo-campaign.webp'],
    ]);

    for (const template of TEMPLATE_CONFIGS) {
      expect(template.previewImageUrl).toContain('/assets/template-previews/');
      expect(template.previewImageUrl).toContain(expectedFiles.get(template.id));
      expect(template.previewImageUrl).not.toContain('/motion/particle-reveal/');
    }
  });
});
