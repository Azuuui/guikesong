import {randomUUID} from 'node:crypto';
import type {
  UgcPhotoCampaignCopy,
  UgcPhotoCampaignPage,
  UgcPhotoCampaignRequest,
  UgcPhotoCampaignResult,
} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {GeneratedImage, ImageProvider, ProviderBundle} from '../../providers/contracts';
import type {StoredImageAsset} from '../../storage/assetStore';
import {reportWorkflowProgress, type Workflow} from '../contracts';
import {loadPosterPrompt, renderCopyPrompt, renderPhotoDescriptionsPrompt} from './promptRenderer';
import {parsePhotoDescriptions, parseUgcPhotoCampaignCopy} from './schemas';

/** Mock Provider 预置数据键；真实 Provider 忽略。 */
export const UGC_PHOTO_CAMPAIGN_FIXTURE_KEYS = {
  descriptions: 'ugc-photo-campaign.descriptions',
  copy: 'ugc-photo-campaign.copy',
} as const;

/** 生图调用使用的竖版画幅参数；提示词内同时声明 3:4 竖版。 */
export const UGC_PHOTO_CAMPAIGN_IMAGE_SIZE = '1024x1536';

export interface UgcPhotoCampaignWorkflowDependencies {
  readonly providers: ProviderBundle;
  /** 按资产 ID 读取投稿照片，返回 data URL；仅进入视觉分析与生图调用。 */
  readonly loadPhotoImage: (assetId: string) => Promise<string>;
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
 * 单张海报生成：失败自动重跑一次（一照片一海报，互不影响，单张失败单张重跑）。
 */
async function generatePosterWithRetry(
  image: ImageProvider,
  posterPrompt: string,
  photoDataUrl: string,
): Promise<GeneratedImage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await image.edit({
        prompt: posterPrompt,
        size: UGC_PHOTO_CAMPAIGN_IMAGE_SIZE,
        imageDataUrls: [photoDataUrl],
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * 游客返图（照片心情图集）工作流。
 * 编排：加载投稿照片 → 视觉分析整组照片（校验+重试一次）→
 * 心情文案与逐张海报并行（海报提示词零改动、只吃单张照片）→ 按上传顺序组装。
 */
export function createUgcPhotoCampaignWorkflow(
  deps: UgcPhotoCampaignWorkflowDependencies,
): Workflow<UgcPhotoCampaignRequest, UgcPhotoCampaignResult> {
  return {
    id: 'ugc-photo-campaign',
    async run(input, context): Promise<UgcPhotoCampaignResult> {
      await reportWorkflowProgress(context, {phase: 'preparing'});
      // 1. 加载全部投稿照片（上传顺序即发布顺序）
      const photoDataUrls = await Promise.all(
        input.photoAssetIds.map(assetId => deps.loadPhotoImage(assetId)),
      );

      // 2. 视觉分析：整组照片 → 每张一句话画面描述（校验+重试一次）
      await reportWorkflowProgress(context, {phase: 'content'});
      const descriptionsPrompt = await renderPhotoDescriptionsPrompt(photoDataUrls.length);
      const descriptions = await generateValidatedOutput(
        () =>
          deps.providers.vision.generateJsonFromImages({
            prompt: descriptionsPrompt,
            imageDataUrls: photoDataUrls,
            fixtureKey: UGC_PHOTO_CAMPAIGN_FIXTURE_KEYS.descriptions,
          }),
        value => parsePhotoDescriptions(value, photoDataUrls.length),
        'DESCRIPTIONS_INVALID',
      );

      // 3. 文案与逐张海报并行；全部落定后再判定结果
      await reportWorkflowProgress(context, {phase: 'copy'});
      const [copyPrompt, posterPrompt] = await Promise.all([
        renderCopyPrompt(descriptions),
        loadPosterPrompt(),
      ]);

      const copyTask: Promise<{mood: string; copy: UgcPhotoCampaignCopy}> =
        generateValidatedOutput(
          () =>
            deps.providers.text.generateJson({
              prompt: copyPrompt,
              fixtureKey: UGC_PHOTO_CAMPAIGN_FIXTURE_KEYS.copy,
            }),
          parseUgcPhotoCampaignCopy,
          'COPY_INVALID',
        );
      const totalImages = photoDataUrls.length;
      let completedImages = 0;
      await reportWorkflowProgress(context, {phase: 'images', completedImages: 0, totalImages});
      const posterTasks: Array<Promise<GeneratedImage>> = photoDataUrls.map(photoDataUrl =>
        generatePosterWithRetry(deps.providers.image, posterPrompt, photoDataUrl).finally(
          async () => {
            completedImages += 1;
            await reportWorkflowProgress(context, {
              phase: 'images',
              completedImages,
              totalImages,
            }).catch(() => undefined);
          },
        ),
      );

      const [copyOutcome, posterOutcomes] = await Promise.all([
        Promise.allSettled([copyTask]).then(([outcome]) => outcome!),
        Promise.allSettled(posterTasks),
      ]);

      if (copyOutcome.status === 'rejected') {
        throw toSafeError(copyOutcome.reason, '文案生成失败，请稍后重试', 'COPY_FAILED');
      }
      const {mood, copy} = copyOutcome.value;
      await reportWorkflowProgress(context, {
        phase: 'finalizing',
        completedImages: totalImages,
        totalImages,
      });

      // 4. 组装结果：页面按上传顺序；投稿昵称按位对齐，空字符串视为未填写
      const pages: UgcPhotoCampaignPage[] = [];
      for (let index = 0; index < photoDataUrls.length; index += 1) {
        const photoIndex = index + 1;
        const credit = input.photoCredits?.[index];
        const hasCredit = typeof credit === 'string' && credit.length > 0;
        const outcome = posterOutcomes[index]!;
        if (outcome.status === 'fulfilled') {
          const asset = await deps.saveGeneratedImage(outcome.value);
          pages.push({
            id: randomUUID(),
            role: 'poster',
            photoIndex,
            ...(hasCredit ? {credit} : {}),
            filename: asset.filename,
            status: 'succeeded',
            imageUrl: asset.url,
            alt: `第${photoIndex}张投稿海报`,
          });
        } else {
          pages.push({
            id: randomUUID(),
            role: 'poster',
            photoIndex,
            ...(hasCredit ? {credit} : {}),
            filename: '',
            status: 'failed',
            alt: `第${photoIndex}张投稿海报`,
            error: toSafeError(outcome.reason, '海报生成失败，请稍后重试', 'IMAGE_FAILED')
              .message,
          });
        }
      }

      const failedPages = pages.filter(page => page.status === 'failed');
      return {
        requestId: context.requestId,
        workflowId: 'ugc-photo-campaign',
        status: failedPages.length === 0 ? 'succeeded' : 'partial',
        pages,
        warnings: [],
        copy,
        mood,
        ...(input.campaignTheme ? {campaignTheme: input.campaignTheme} : {}),
      };
    },
  };
}
