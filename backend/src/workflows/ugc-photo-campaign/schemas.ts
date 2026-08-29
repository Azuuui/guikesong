import {z} from 'zod';
import type {UgcPhotoCampaignCopy} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';

const nonEmpty = z.string().min(1);

/** 照片数量边界（见《生产线设计-照片心情图集》四、边界与校验）。 */
export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 7;

const rawDescriptionsSchema = z.object({
  descriptions: z.array(z.string().min(1).max(50)),
});

const rawCopySchema = z.object({
  mood: nonEmpty,
  titles: z.array(nonEmpty).length(3),
  body: nonEmpty,
  tags: z.array(nonEmpty).min(1),
});

export interface ParsedUgcPhotoCampaignCopy {
  readonly mood: string;
  readonly copy: UgcPhotoCampaignCopy;
}

/**
 * 解析视觉分析输出的照片画面描述。
 * 校验：descriptions 数量与照片数量一致、每条非空且不超过 50 字。
 */
export function parsePhotoDescriptions(value: unknown, photoCount: number): string[] {
  const result = rawDescriptionsSchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(502, '照片描述数据无效，请重试', 'DESCRIPTIONS_INVALID');
  }
  const descriptions = result.data.descriptions;
  if (descriptions.length !== photoCount) {
    throw new ApiError(
      502,
      `照片描述数量与照片数量不一致（${descriptions.length}/${photoCount}），请重试`,
      'DESCRIPTIONS_INVALID',
    );
  }
  return descriptions;
}

/** 解析心情文案输出的 mood、标题候选、正文与标签。 */
export function parseUgcPhotoCampaignCopy(value: unknown): ParsedUgcPhotoCampaignCopy {
  const result = rawCopySchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(502, '发布文案数据无效，请重试', 'COPY_INVALID');
  }
  const {mood, titles, body, tags} = result.data;
  return {mood, copy: {titles, body, tags}};
}
