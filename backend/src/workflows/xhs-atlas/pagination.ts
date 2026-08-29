import type {XhsAtlasListItem} from '../../../../shared/workflows';
import {MAX_TOPIC_COUNT, MIN_TOPIC_COUNT} from './normalizeTopic';

/** 内容页每页条数上限（《README-工作流与脚本规范》布局常量）。 */
export const PER_PAGE = 6;

export interface CoverLayout {
  readonly cols: number;
  readonly rows: number;
}

export interface AtlasPagePlan {
  /** 0 起始的全局页序。 */
  readonly pageIndex: number;
  /** 详解 / 上篇 / 中篇 / 下篇 / 第N辑。 */
  readonly pageLabel: string;
  readonly items: readonly XhsAtlasListItem[];
  readonly startNo: string;
  readonly endNo: string;
}

/**
 * 封面网格查表（《3-封面生图模板》网格表）。
 * N=2~5 按 N<6 稀疏规则取 2 列；N=6~36 按网格表取值。
 */
export function computeCoverLayout(n: number): CoverLayout {
  if (n < MIN_TOPIC_COUNT || n > MAX_TOPIC_COUNT) {
    throw new Error(`封面网格仅支持 ${MIN_TOPIC_COUNT}~${MAX_TOPIC_COUNT} 个条目，当前 ${n}`);
  }
  if (n <= 5) return {cols: 2, rows: Math.ceil(n / 2)};
  if (n <= 9) return {cols: 3, rows: Math.ceil(n / 3)};
  if (n <= 12) return {cols: 4, rows: 3};
  if (n <= 16) return {cols: 4, rows: 4};
  if (n <= 20) return {cols: 4, rows: 5};
  if (n <= 24) return {cols: 4, rows: 6};
  if (n <= 30) return {cols: 5, rows: 6};
  return {cols: 6, rows: 6};
}

function pageLabelOf(pageIndex: number, pageCount: number): string {
  if (pageCount === 1) return '详解';
  if (pageCount === 2) return pageIndex === 0 ? '上篇' : '下篇';
  if (pageCount === 3) return ['上篇', '中篇', '下篇'][pageIndex]!;
  return `第${pageIndex + 1}辑`;
}

/**
 * 均衡分页：页数 K = ⌈N / perPage⌉，各页条数相差不超过 1（前余数页多 1 条）。
 * 例：7→4+3，12→6+6，13→5+4+4，36→6页×6条。
 */
export function paginateItems(
  items: readonly XhsAtlasListItem[],
  perPage: number = PER_PAGE,
): AtlasPagePlan[] {
  if (items.length === 0) return [];

  const pageCount = Math.ceil(items.length / perPage);
  const base = Math.floor(items.length / pageCount);
  const remainder = items.length % pageCount;

  const pages: AtlasPagePlan[] = [];
  let cursor = 0;
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const size = pageIndex < remainder ? base + 1 : base;
    const pageItems = items.slice(cursor, cursor + size);
    cursor += size;
    pages.push({
      pageIndex,
      pageLabel: pageLabelOf(pageIndex, pageCount),
      items: pageItems,
      startNo: pageItems[0]!.no,
      endNo: pageItems[pageItems.length - 1]!.no,
    });
  }
  return pages;
}
