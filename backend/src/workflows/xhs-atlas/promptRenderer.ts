import {readFile} from 'node:fs/promises';
import type {XhsAtlasList, XhsAtlasListItem} from '../../../../shared/workflows';
import type {AtlasPagePlan, CoverLayout} from './pagination';

/**
 * 小红书图鉴提示词渲染器。
 * 规则（见《README-工作流与脚本规范》）：
 * 1. `{{槽位}}` 由代码确定性填充，原样替换、不做任何改写。
 * 2. 分页、网格查表、卡片行拼装均为纯脚本逻辑，不进模型提示词。
 * 3. 渲染结果不允许残留任何 `{{...}}` 占位符。
 */

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

const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/;

/** 逐槽位替换并校验：残留任何占位符即抛错。 */
function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  const residual = rendered.match(PLACEHOLDER_PATTERN);
  if (residual) {
    throw new Error(`提示词存在未填充占位符：${residual[0]}`);
  }
  return rendered.trimEnd();
}

/** ACCENT_COLOR：meta.palette 里的主色名（如"暖橙色""蓝绿色"）。 */
export function accentColorOf(palette: string): string {
  if (palette.endsWith('色')) return palette;
  return `${palette.slice(-2)}色`;
}

/** PALETTE_DESC：由 meta.palette 扩展出的纸张底色描述。 */
export function paletteDescOf(palette: string): string {
  if (palette.endsWith('色调')) return palette;
  if (palette.endsWith('色')) return `${palette}调`;
  return `${palette}色调`;
}

/** 封面卡片行：`{no}"{tag}：{name}"，插画是{illustration_hint}，底部小字"{line1}。"` */
function coverCardLine(item: XhsAtlasListItem): string {
  return `${item.no}"${item.tag}：${item.name}"，插画是${item.illustrationHint}，底部小字"${item.line1}。"`;
}

/** 正文页卡片行：标签词随主题域（field_labels）填入。 */
function contentCardLine(item: XhsAtlasListItem, label1: string, label2: string): string {
  return `${item.no}"${item.tag}：${item.name}"，插画是${item.illustrationHint}；"${label1}"后写"${item.line2}"；"${label2}"后写"${item.punch}"。`;
}

/** 渲染封面生图提示词（《3-封面生图模板》）。 */
export async function renderAtlasCoverPrompt(
  list: XhsAtlasList,
  layout: CoverLayout,
): Promise<string> {
  const template = await loadPromptTemplate('cover.md');
  return renderTemplate(template, {
    PALETTE_DESC: paletteDescOf(list.meta.palette),
    ACCENT_COLOR: accentColorOf(list.meta.palette),
    MOTIF: list.meta.motif,
    TITLE_LINE1: list.cover.titleLine1,
    TITLE_LINE2: list.cover.titleLine2,
    HIGHLIGHT_WORD: list.cover.highlightWord,
    STICKY_NOTE: list.cover.stickyNote,
    BOTTOM_SLOGAN: list.cover.bottomSlogan,
    COLS: String(layout.cols),
    ROWS: String(layout.rows),
    N: String(list.items.length),
    COVER_CARDS: list.items.map(coverCardLine).join('\n'),
  });
}

/** 渲染单个正文页生图提示词（《4-正文页生图模板》）。 */
export async function renderAtlasContentPrompt(
  list: XhsAtlasList,
  page: AtlasPagePlan,
): Promise<string> {
  const slogan = list.meta.pageSlogans[page.pageIndex];
  if (!slogan) {
    throw new Error(`分页口号缺失：第 ${page.pageIndex + 1} 页`);
  }
  const [label1, label2] = list.meta.fieldLabels;
  const template = await loadPromptTemplate('content.md');
  return renderTemplate(template, {
    PALETTE_DESC: paletteDescOf(list.meta.palette),
    ACCENT_COLOR: accentColorOf(list.meta.palette),
    MOTIF: list.meta.motif,
    PAGE_LABEL: page.pageLabel,
    THEME_WORD: list.meta.themeWord,
    START_NO: page.startNo,
    END_NO: page.endNo,
    K_CARD: String(page.items.length),
    PAGE_CARDS: page.items.map(item => contentCardLine(item, label1, label2)).join('\n'),
    PAGE_SLOGAN: slogan,
    LABEL_1: label1,
    LABEL_2: label2,
  });
}
