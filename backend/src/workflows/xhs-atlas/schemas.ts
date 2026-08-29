import {z} from 'zod';
import type {XhsAtlasCopy, XhsAtlasList} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';

const nonEmpty = z.string().min(1);

const listMetaSchema = z.object({
  user_title: nonEmpty,
  count: z.number().int().min(2).max(36),
  measure_word: z.string(),
  domain_type: nonEmpty,
  org_dimension: nonEmpty,
  theme_word: nonEmpty,
  field_labels: z.tuple([nonEmpty, nonEmpty]),
  motif: nonEmpty,
  palette: nonEmpty,
  page_slogans: z.array(nonEmpty).length(6),
});

const listCoverSchema = z.object({
  title_line1: nonEmpty,
  title_line2: nonEmpty,
  highlight_word: nonEmpty,
  sticky_note: nonEmpty,
  bottom_slogan: nonEmpty,
});

const listItemSchema = z.object({
  no: z.string().regex(/^\d{2}$/, 'no 必须是两位零填充序号'),
  tag: nonEmpty,
  name: nonEmpty,
  line1: nonEmpty,
  line2: nonEmpty,
  punch: nonEmpty,
  illustration_hint: nonEmpty,
});

const rawListSchema = z.object({
  meta: listMetaSchema,
  cover: listCoverSchema,
  items: z.array(listItemSchema).min(2).max(36),
});

const rawCopySchema = z.object({
  titles: z.array(nonEmpty).min(1),
  body: nonEmpty,
  tags: z.array(nonEmpty).min(1),
});

function invalid(message: string): ApiError {
  return new ApiError(502, message, 'LIST_INVALID');
}

/**
 * 解析并校验提示词一输出的清单 JSON。
 * 校验：结构完整、items 数量与选题数量一致、name 不重复、no 为 01 起连续序号、
 * page_slogans 恰好 6 条。通过后映射为共享契约的驼峰类型。
 */
export function parseXhsAtlasList(value: unknown, expectedCount: number): XhsAtlasList {
  const result = rawListSchema.safeParse(value);
  if (!result.success) {
    throw invalid('清单数据无效，请重试');
  }
  const raw = result.data;

  const problems: string[] = [];
  if (raw.meta.count !== expectedCount) {
    problems.push('清单数量与选题不一致');
  }
  if (raw.items.length !== expectedCount) {
    problems.push('条目数量与选题不一致');
  }
  const names = raw.items.map(item => item.name);
  if (new Set(names).size !== names.length) {
    problems.push('条目名重复');
  }
  const hasSequentialNo = raw.items.every(
    (item, index) => item.no === String(index + 1).padStart(2, '0'),
  );
  if (!hasSequentialNo) {
    problems.push('条目序号不连续');
  }
  if (problems.length > 0) {
    throw invalid(`清单数据无效：${problems.join('；')}，请重试`);
  }

  return {
    meta: {
      userTitle: raw.meta.user_title,
      count: raw.meta.count,
      measureWord: raw.meta.measure_word,
      domainType: raw.meta.domain_type,
      orgDimension: raw.meta.org_dimension,
      themeWord: raw.meta.theme_word,
      fieldLabels: [raw.meta.field_labels[0], raw.meta.field_labels[1]],
      motif: raw.meta.motif,
      palette: raw.meta.palette,
      pageSlogans: raw.meta.page_slogans,
    },
    cover: {
      titleLine1: raw.cover.title_line1,
      titleLine2: raw.cover.title_line2,
      highlightWord: raw.cover.highlight_word,
      stickyNote: raw.cover.sticky_note,
      bottomSlogan: raw.cover.bottom_slogan,
    },
    items: raw.items.map(item => ({
      no: item.no,
      tag: item.tag,
      name: item.name,
      line1: item.line1,
      line2: item.line2,
      punch: item.punch,
      illustrationHint: item.illustration_hint,
    })),
  };
}

/** 解析提示词二输出的发布文案。 */
export function parseXhsAtlasCopy(value: unknown): XhsAtlasCopy {
  const result = rawCopySchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(502, '发布文案数据无效，请重试', 'COPY_INVALID');
  }
  return result.data;
}
