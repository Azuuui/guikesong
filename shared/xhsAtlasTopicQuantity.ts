/** 小红书图鉴支持的量词；中文数字只有紧跟这些量词时才视为数量。 */
const TOPIC_MEASURE_WORDS = [
  '种', '件', '条', '个', '招', '式', '部', '本', '家', '处', '座', '道', '款', '步', '句',
  '篇', '位', '样', '册', '张', '场', '课', '题', '技', '法',
] as const;

const MEASURE_WORD_PATTERN = new RegExp(`^(${TOPIC_MEASURE_WORDS.join('|')})`);
const CHINESE_QUANTITY_PATTERN = new RegExp(
  `([零〇一二两三四五六七八九十]+)(${TOPIC_MEASURE_WORDS.join('|')})`,
  'g',
);

const CHINESE_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

export interface TopicQuantityMatch {
  readonly count: number;
  readonly rawNumber: string;
  readonly index: number;
  readonly length: number;
  readonly measureWord: string;
}

function parseChineseNumber(raw: string): number | undefined {
  const parts = raw.split('十');
  if (parts.length > 2) return undefined;

  if (parts.length === 2) {
    const tens = parts[0] === '' ? 1 : CHINESE_DIGITS[parts[0] ?? ''];
    const ones = parts[1] === '' ? 0 : CHINESE_DIGITS[parts[1] ?? ''];
    if (tens === undefined || ones === undefined) return undefined;
    return tens * 10 + ones;
  }

  const digits = [...raw].map(character => CHINESE_DIGITS[character]);
  if (digits.some(digit => digit === undefined)) return undefined;
  return Number(digits.join(''));
}

/**
 * 定位选题中的数量。
 *
 * 阿拉伯数字保持兼容，可省略量词；中文数字必须紧跟受支持量词，避免把普通文案里的“一、十”误判为数量。
 */
export function findXhsAtlasTopicQuantity(topic: string): TopicQuantityMatch | undefined {
  const arabicMatch = /\d+/.exec(topic);
  const chineseMatch = CHINESE_QUANTITY_PATTERN.exec(topic);
  CHINESE_QUANTITY_PATTERN.lastIndex = 0;

  const useChinese = chineseMatch !== null
    && (arabicMatch === null || (chineseMatch.index ?? 0) < (arabicMatch.index ?? 0));

  if (useChinese && chineseMatch) {
    const rawNumber = chineseMatch[1] ?? '';
    const count = parseChineseNumber(rawNumber);
    if (count === undefined) return undefined;
    return {
      count,
      rawNumber,
      index: chineseMatch.index ?? 0,
      length: rawNumber.length,
      measureWord: chineseMatch[2] ?? '',
    };
  }

  if (!arabicMatch) return undefined;
  const rawNumber = arabicMatch[0];
  const afterNumber = topic.slice((arabicMatch.index ?? 0) + rawNumber.length);
  return {
    count: Number(rawNumber),
    rawNumber,
    index: arabicMatch.index ?? 0,
    length: rawNumber.length,
    measureWord: afterNumber.match(MEASURE_WORD_PATTERN)?.[1] ?? '',
  };
}
