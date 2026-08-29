import {randomUUID} from 'node:crypto';
import type {
  XhsAtlasCopy,
  XhsAtlasPage,
  XhsAtlasRequest,
  XhsAtlasResult,
} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {GeneratedImage, ProviderBundle} from '../../providers/contracts';
import type {StoredImageAsset} from '../../storage/assetStore';
import {reportWorkflowProgress, type Workflow} from '../contracts';
import {normalizeTopic} from './normalizeTopic';
import {computeCoverLayout, paginateItems} from './pagination';
import {
  loadPromptTemplate,
  renderAtlasContentPrompt,
  renderAtlasCoverPrompt,
} from './promptRenderer';
import {parseXhsAtlasCopy, parseXhsAtlasList} from './schemas';

/** Mock Provider 预置数据键；真实 Provider 忽略。 */
export const XHS_ATLAS_FIXTURE_KEYS = {
  list: 'xhs-atlas.list',
  copy: 'xhs-atlas.copy',
} as const;

/** 生图调用使用的竖版画幅参数；提示词内同时声明 3:4 竖版。 */
export const XHS_ATLAS_IMAGE_SIZE = '1024x1536';

export interface XhsAtlasWorkflowDependencies {
  readonly providers: ProviderBundle;
  /** 按资产 ID 读取参考图，返回 data URL；仅进入生图调用。 */
  readonly loadReferenceImage: (assetId: string) => Promise<string>;
  readonly saveGeneratedImage: (image: GeneratedImage) => Promise<StoredImageAsset>;
}

function toSafeError(error: unknown, fallbackMessage: string, code: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(502, fallbackMessage, code);
}

/** 结构化输出无效时重试一次；其余错误直接透传。 */
async function generateValidatedOutput<T>(
  invoke: () => Promise<unknown>,
  parse: (value: unknown) => T,
  invalidCode: string,
): Promise<T> {
  let lastError: ApiError = new ApiError(502, '结构化输出无效，请重试', invalidCode);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return parse(await invoke());
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== invalidCode) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * 小红书图鉴工作流。
 * 编排：规范化选题 → 清单 JSON（校验+重试一次）→ 分页与网格计算 →
 * 文案、封面与全部正文页并行生图。
 */
export function createXhsAtlasWorkflow(
  deps: XhsAtlasWorkflowDependencies,
): Workflow<XhsAtlasRequest, XhsAtlasResult> {
  return {
    id: 'xhs-atlas',
    async run(input, context): Promise<XhsAtlasResult> {
      // 1. 规范化输入：数量边界钳制
      await reportWorkflowProgress(context, {phase: 'preparing'});
      const normalized = normalizeTopic(input.topic);

      // 2. 加载参考图（仅进入生图调用，不参与清单与文案事实生成）
      const referenceDataUrls = await Promise.all(
        input.referenceAssetIds.map(assetId => deps.loadReferenceImage(assetId)),
      );

      // 3. 提示词一：选题 → 清单 JSON
      await reportWorkflowProgress(context, {phase: 'content'});
      const listPromptTemplate = await loadPromptTemplate('list-json.md');
      const list = await generateValidatedOutput(
        () =>
          deps.providers.text.generateJson({
            prompt: listPromptTemplate.split('{{USER_TITLE}}').join(normalized.topic),
            fixtureKey: XHS_ATLAS_FIXTURE_KEYS.list,
          }),
        value => parseXhsAtlasList(value, normalized.count),
        'LIST_INVALID',
      );

      // 4. 纯脚本确定性计算：分页与封面网格
      const pagePlans = paginateItems(list.items);
      const layout = computeCoverLayout(list.items.length);

      // 5. 渲染全部提示词后，文案、封面与正文页并行执行
      const [copyPromptTemplate, coverPrompt, ...contentPrompts] = await Promise.all([
        loadPromptTemplate('xhs-copy.md'),
        renderAtlasCoverPrompt(list, layout),
        ...pagePlans.map(page => renderAtlasContentPrompt(list, page)),
      ]);
      const copyPrompt = copyPromptTemplate
        .split('{{USER_TITLE}}')
        .join(normalized.topic)
        .split('{{LIST_JSON}}')
        .join(JSON.stringify(list, null, 2));

      const generateImage = (prompt: string): Promise<GeneratedImage> =>
        referenceDataUrls.length > 0
          ? deps.providers.image.edit({
              prompt,
              size: XHS_ATLAS_IMAGE_SIZE,
              imageDataUrls: referenceDataUrls,
            })
          : deps.providers.image.generate({prompt, size: XHS_ATLAS_IMAGE_SIZE});

      // 文案、封面与全部正文页并行执行；全部落定后再判定结果
      await reportWorkflowProgress(context, {phase: 'copy'});
      const copyTask: Promise<XhsAtlasCopy> = generateValidatedOutput(
        () =>
          deps.providers.text.generateJson({
            prompt: copyPrompt,
            fixtureKey: XHS_ATLAS_FIXTURE_KEYS.copy,
          }),
        parseXhsAtlasCopy,
        'COPY_INVALID',
      );
      const imagePrompts = [coverPrompt, ...contentPrompts];
      const totalImages = imagePrompts.length;
      let completedImages = 0;
      await reportWorkflowProgress(context, {phase: 'images', completedImages: 0, totalImages});
      const imageTasks: Array<Promise<GeneratedImage>> = imagePrompts.map(prompt =>
        generateImage(prompt).finally(async () => {
          completedImages += 1;
          await reportWorkflowProgress(context, {
            phase: 'images',
            completedImages,
            totalImages,
          }).catch(() => undefined);
        }),
      );

      const [copyOutcome, imageOutcomes] = await Promise.all([
        Promise.allSettled([copyTask]).then(([outcome]) => outcome!),
        Promise.allSettled(imageTasks),
      ]);

      if (copyOutcome.status === 'rejected') {
        throw toSafeError(copyOutcome.reason, '文案生成失败，请稍后重试', 'COPY_FAILED');
      }
      const copy = copyOutcome.value;
      await reportWorkflowProgress(context, {
        phase: 'finalizing',
        completedImages: totalImages,
        totalImages,
      });

      // 6. 组装结果：封面排第一，个别页面失败标记为 partial
      const alts: string[] = [
        '图鉴封面',
        ...pagePlans.map(page => `${list.meta.themeWord}详解 ${page.startNo}—${page.endNo}`),
      ];
      const pages: XhsAtlasPage[] = [];
      for (let index = 0; index < imagePrompts.length; index += 1) {
        const outcome = imageOutcomes[index]!;
        if (outcome.status === 'fulfilled') {
          const asset = await deps.saveGeneratedImage(outcome.value);
          pages.push({
            id: randomUUID(),
            role: index === 0 ? 'cover' : 'content',
            filename: asset.filename,
            status: 'succeeded',
            imageUrl: asset.url,
            alt: alts[index],
          });
        } else {
          pages.push({
            id: randomUUID(),
            role: index === 0 ? 'cover' : 'content',
            filename: '',
            status: 'failed',
            alt: alts[index],
            error: toSafeError(outcome.reason, '图片生成失败，请稍后重试', 'IMAGE_FAILED').message,
          });
        }
      }

      const failedPages = pages.filter(page => page.status === 'failed');
      return {
        requestId: context.requestId,
        workflowId: 'xhs-atlas',
        status: failedPages.length === 0 ? 'succeeded' : 'partial',
        pages,
        warnings: [...normalized.warnings],
        copy,
        topic: normalized.topic,
        list,
      };
    },
  };
}
