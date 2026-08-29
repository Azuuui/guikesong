import {ApiError} from '../../http/apiError';

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

const NUMBER_PATTERN = /\d+/;
const MEASURE_WORD_PATTERN = /^(种|件|条|个|招|式|部|本|家|处|座|道|款|步|句|篇|位|样|册|张|场|课|题|技|法)/;

/**
 * 规范化图鉴选题：提取数字 N 与量词，执行 2~36 边界规则。
 * 无数字或 N<2 抛业务错误；N>36 钳制为 36 并同步改写标题数字，产生 warning。
 */
export function normalizeTopic(rawTopic: string): NormalizedTopic {
  const trimmed = rawTopic.trim();
  const match = trimmed.match(NUMBER_PATTERN);
  if (!match) {
    throw new ApiError(400, '选题需包含数量，如"贵阳的12种美食"', 'TOPIC_MISSING_QUANTITY');
  }
  const parsedCount = Number(match[0]);
  if (parsedCount < MIN_TOPIC_COUNT) {
    throw new ApiError(400, '选题数量至少为 2', 'TOPIC_BELOW_MIN');
  }

  const warnings: string[] = [];
  let count = parsedCount;
  let topic = trimmed;
  if (parsedCount > MAX_TOPIC_COUNT) {
    count = MAX_TOPIC_COUNT;
    topic = trimmed.replace(match[0], String(MAX_TOPIC_COUNT));
    warnings.push(`选题数量已从 ${parsedCount} 收敛为 ${MAX_TOPIC_COUNT}，标题数字已同步改写`);
  }

  const afterNumber = trimmed.slice((match.index ?? 0) + match[0].length);
  const measureWordMatch = afterNumber.match(MEASURE_WORD_PATTERN);

  return {topic, count, measureWord: measureWordMatch?.[1] ?? '', warnings};
}
