import {z} from 'zod';
import type {OriginalIpCopy} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';

const nonEmpty = z.string().min(1);

const colorSchema = z.object({
  hex: nonEmpty,
  名称: nonEmpty,
});

/** 提示词 A 的输出：品牌视觉 DNA。 */
export const brandDnaSchema = z.object({
  品牌名: nonEmpty,
  英文辅助名: nonEmpty,
  slogan: nonEmpty,
  行业类型: nonEmpty,
  一句话定位: nonEmpty,
  目标人群: nonEmpty,
  品牌故事要点: nonEmpty,
  核心关键词: z.array(nonEmpty).min(1),
  色彩系统: z.object({
    主色: colorSchema,
    辅色: colorSchema,
    点缀色: colorSchema,
  }),
  字体气质: nonEmpty,
  图形语言: nonEmpty,
  产品呈现方式: nonEmpty,
  IP设定: z.object({
    路线: nonEmpty,
    应用方式: nonEmpty,
  }),
  画面质感: nonEmpty,
  主打产品: nonEmpty,
  SKU信息: z.string().default(''),
  文化元素: z.string().default(''),
  应用方向: z.array(z.string()).default([]),
  禁止元素: z.array(nonEmpty).min(1),
  画幅比例: nonEmpty,
});

export type BrandDna = z.infer<typeof brandDnaSchema>;

const boardBaseSchema = z.object({
  序号: z.number().int().min(1).max(4),
  职责: nonEmpty,
  画面主体: nonEmpty,
  构图版式: nonEmpty,
  出现物料: z.array(nonEmpty).min(1),
  画面文字: z.array(z.object({文案: nonEmpty, 位置: nonEmpty})).min(1),
  场景与氛围: nonEmpty,
  记忆点: nonEmpty,
  IP动态: nonEmpty,
});

/** 提示词 B 的输出：四图画面内容规划。 */
export const boardPlanSchema = z.object({
  boards: z
    .tuple([
      boardBaseSchema,
      boardBaseSchema.extend({模块规划: nonEmpty}),
      boardBaseSchema.extend({主物料: nonEmpty, 延展物料: z.array(nonEmpty).min(1)}),
      boardBaseSchema.extend({场景选择: nonEmpty}),
    ])
    .refine(boards => boards.every((board, index) => board.序号 === index + 1), {
      message: 'boards 序号必须为 1～4 且顺序一致',
    }),
});

export type BoardPlan = z.infer<typeof boardPlanSchema>;

/** 文案提示词的输出：标题、正文、标签。 */
export const originalIpCopySchema = z.object({
  title: nonEmpty,
  body: nonEmpty,
  tags: z.array(nonEmpty).min(1),
});

export function parseBrandDna(value: unknown): BrandDna {
  const result = brandDnaSchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(502, '品牌 DNA 数据无效，请重试', 'BRAND_DNA_INVALID');
  }
  return result.data;
}

export function parseBoardPlan(value: unknown): BoardPlan {
  const result = boardPlanSchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(502, '画面规划数据无效，请重试', 'BOARD_PLAN_INVALID');
  }
  return result.data;
}

export function parseOriginalIpCopy(value: unknown): OriginalIpCopy {
  const result = originalIpCopySchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(502, '发布文案数据无效，请重试', 'COPY_INVALID');
  }
  return result.data;
}
