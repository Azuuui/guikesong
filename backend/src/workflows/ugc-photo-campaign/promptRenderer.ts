import {readFile} from 'node:fs/promises';

/**
 * 照片心情图集提示词渲染器。
 * 规则（见《生产线设计-照片心情图集》二、流水线）：
 * 1. 生图提示词（照片转海报）零改动，逐张独立使用，一照片一海报，互不依赖；
 *    照片内的标题与 tagline 由生图模型自己从画面提炼。
 * 2. `{{槽位}}` 由代码确定性填充，原样替换、不做任何改写；
 *    渲染结果不允许残留任何 `{{...}}` 占位符。
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

/** 渲染视觉分析提示词（照片数 N 注入）。 */
export async function renderPhotoDescriptionsPrompt(photoCount: number): Promise<string> {
  const template = await loadPromptTemplate('photo-descriptions.md');
  return renderTemplate(template, {N: String(photoCount)});
}

/** 渲染心情文案提示词（照片数 N 与编号画面描述清单注入）。 */
export async function renderCopyPrompt(descriptions: readonly string[]): Promise<string> {
  const template = await loadPromptTemplate('copy.md');
  return renderTemplate(template, {
    N: String(descriptions.length),
    PHOTO_LIST: descriptions
      .map((description, index) => `${index + 1}. ${description}`)
      .join('\n'),
  });
}

/** 加载照片转海报生图提示词全文（零改动，逐张独立使用，无任何槽位）。 */
export async function loadPosterPrompt(): Promise<string> {
  return loadPromptTemplate('poster.md');
}
