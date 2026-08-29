import {readFile} from 'node:fs/promises';
import type {BrandDna, BoardPlan} from './schemas';

/**
 * 原创 IP 提示词渲染器。
 * 规则（见《原创IP.md》拼接逻辑）：
 * 1. `{{双花括号}}` 由代码确定性填充，原样替换、不做任何改写。
 * 2. C-0 填充结果必须逐字相同地出现在 4 条提示词中。
 * 3. 字段为空字符串时删除占位符所在整行。
 * 4. 渲染结果不允许残留任何 `{{...}}` 占位符。
 */

const C0_MARKER = '{{C-0 填充结果}}';
const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/g;
const LIST_SUFFIX_PATTERN = /，顿号连接$|\s*逐条列出(：文案 \+ 位置)?$/;

interface RenderContext {
  readonly dna: BrandDna;
  readonly board?: BoardPlan['boards'][number];
  readonly ipDescription: string;
}

const templateCache = new Map<string, Promise<string>>();

/** 加载提示词模板文件（带缓存，去除多余尾部空白）。 */
export function loadPromptTemplate(filename: string): Promise<string> {
  let cached = templateCache.get(filename);
  if (!cached) {
    cached = readFile(new URL(`./prompts/${filename}`, import.meta.url), 'utf8').then(
      content => content.trimEnd(),
    );
    templateCache.set(filename, cached);
  }
  return cached;
}

function readField(source: unknown, fieldPath: string): unknown {
  let current: unknown = source;
  for (const segment of fieldPath.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** 数组用顿号连接；画面文字逐条列出「文案 + 位置」。 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === 'string')) {
      return value.join('、');
    }
    return value
      .map(item => {
        if (typeof item === 'object' && item !== null && '文案' in item) {
          const entry = item as {文案: unknown; 位置: unknown};
          return `${String(entry.文案)}（位置：${String(entry.位置)}）`;
        }
        return String(item);
      })
      .join('\n');
  }
  throw new Error(`无法格式化占位符字段：${JSON.stringify(value)}`);
}

function resolvePlaceholder(name: string, context: RenderContext): string {
  if (name === 'ip.desc') return context.ipDescription;

  const planMatch = name.match(/^plan([1-4])\.(.+)$/);
  if (planMatch) {
    if (!context.board) {
      throw new Error(`占位符 ${name} 需要画面规划数据`);
    }
    const field = planMatch[2]!.replace(LIST_SUFFIX_PATTERN, '');
    return formatValue(readField(context.board, field));
  }

  if (name.startsWith('dna.')) {
    const field = name.slice('dna.'.length);
    const colorMatch = field.match(/^(主色|辅色|点缀色)(hex|名称)$/);
    if (colorMatch) {
      const color = readField(context.dna, `色彩系统.${colorMatch[1]}`) as {hex: string; 名称: string};
      return colorMatch[2] === 'hex' ? color.hex : color.名称;
    }
    return formatValue(readField(context.dna, field.replace(LIST_SUFFIX_PATTERN, '')));
  }

  throw new Error(`未知占位符：${name}`);
}

/** 逐行渲染：任一占位符的值为空时删除所在整行。 */
function renderLines(template: string, context: RenderContext): string {
  return template
    .split('\n')
    .map(line => {
      const matches = [...line.matchAll(PLACEHOLDER_PATTERN)];
      if (matches.length === 0) return line;
      const values = matches.map(match => resolvePlaceholder(match[1]!.trim(), context));
      if (values.some(value => value.trim() === '')) return null;
      return matches.reduce(
        (rendered, match, index) => rendered.split(match[0]).join(values[index]!),
        line,
      );
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** 渲染 C-0 共享品牌 DNA 块（四条生图提示词开头逐字相同的一段）。 */
export async function renderSharedDnaBlock(dna: BrandDna, ipDescription: string): Promise<string> {
  const template = await loadPromptTemplate('c0-brand-dna.md');
  return renderLines(template, {dna, ipDescription});
}

/** 渲染 C-1～C-4 四条完整图生图提示词。 */
export async function renderOriginalIpPrompts(
  dna: BrandDna,
  plan: BoardPlan,
  ipDescription: string,
): Promise<[string, string, string, string]> {
  const sharedBlock = await renderSharedDnaBlock(dna, ipDescription);
  const templateFiles = ['c1-cover.md', 'c2-identity.md', 'c3-products.md', 'c4-scene.md'];

  const prompts = await Promise.all(
    templateFiles.map(async (filename, index) => {
      const template = await loadPromptTemplate(filename);
      const withBlock = template.replace(C0_MARKER, () => sharedBlock);
      return renderLines(withBlock, {dna, board: plan.boards[index], ipDescription}).trimEnd();
    }),
  );
  return prompts as [string, string, string, string];
}
