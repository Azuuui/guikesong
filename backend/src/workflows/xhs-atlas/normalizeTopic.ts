import {ApiError} from '../../http/apiError';
import {findXhsAtlasTopicQuantity} from '../../../../shared/xhsAtlasTopicQuantity';

/** 图鉴数量边界（见《README-工作流与脚本规范》边界规则）。 */
export const MIN_TOPIC_COUNT = 2;
export const MAX_TOPIC_COUNT = 36;

export interface NormalizedTopic {
  /** 数量超限时已改写数字后的选题；其余情况为去除首尾空白的原选题。 */
  readonly topic: string;
  /** 2 ≤ count ≤ 36。 */
  readonly count: number;
  /** 紧跟数字的量词（种/件/条/个…）；未写量词时为空字符串。 */
  readonly measureWord: string;
  readonly warnings: string[];
}

/**
 * 规范化图鉴选题：提取阿拉伯数字或中文数量 N 与量词，执行 2~36 边界规则。
 * 无数量或 N<2 抛业务错误；N>36 钳制为 36 并同步改写标题数字，产生 warning。
 */
export function normalizeTopic(rawTopic: string): NormalizedTopic {
  const trimmed = rawTopic.trim();
  const match = findXhsAtlasTopicQuantity(trimmed);
  if (!match) {
    throw new ApiError(400, '选题需包含数量，如"贵阳的12种美食"', 'TOPIC_MISSING_QUANTITY');
  }
  const parsedCount = match.count;
  if (parsedCount < MIN_TOPIC_COUNT) {
    throw new ApiError(400, '选题数量至少为 2', 'TOPIC_BELOW_MIN');
  }

  const warnings: string[] = [];
  let count = parsedCount;
  let topic = trimmed;
  if (parsedCount > MAX_TOPIC_COUNT) {
    count = MAX_TOPIC_COUNT;
    topic = `${trimmed.slice(0, match.index)}${MAX_TOPIC_COUNT}${trimmed.slice(match.index + match.length)}`;
    warnings.push(`选题数量已从 ${parsedCount} 收敛为 ${MAX_TOPIC_COUNT}，标题数字已同步改写`);
  }

  return {topic, count, measureWord: match.measureWord, warnings};
}
