import {randomUUID} from 'node:crypto';
import type {IpProfile, OriginalIpPage, OriginalIpRequest, OriginalIpResult} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {GeneratedImage, ProviderBundle} from '../../providers/contracts';
import {createOverviewCollage} from '../../services/collage';
import type {StoredImageAsset} from '../../storage/assetStore';
import {reportWorkflowProgress, type Workflow} from '../contracts';
import {loadPromptTemplate, renderOriginalIpPrompts} from './promptRenderer';
import {parseBoardPlan, parseBrandDna, parseOriginalIpCopy} from './schemas';

/** Mock Provider 预置数据键；真实 Provider 忽略。 */
export const ORIGINAL_IP_FIXTURE_KEYS = {
  brandDna: 'original-ip.brand-dna',
  boardPlan: 'original-ip.board-plan',
  copy: 'original-ip.copy',
} as const;

/** 生图调用使用的竖版画幅参数；提示词内同时声明 3:4 竖版。 */
export const ORIGINAL_IP_IMAGE_SIZE = '1024x1536';

export interface OriginalIpWorkflowDependencies {
  readonly providers: ProviderBundle;
  readonly loadIpProfile: () => Promise<IpProfile | null>;
  readonly loadIpReferenceImage: () => Promise<string>;
  readonly loadProductImage: (productAssetId: string) => Promise<string>;
  readonly saveGeneratedImage: (image: GeneratedImage) => Promise<StoredImageAsset>;
  readonly createOverviewCollage?: (images: readonly GeneratedImage[]) => Promise<GeneratedImage>;
}

const PAGE_ROLES: ReadonlyArray<OriginalIpPage['role']> = [
  'brand-cover',
  'identity-system',
  'product-system',
  'scene-application',
];

const PAGE_ALTS = [
  '品牌主视觉封面图',
  '品牌识别与 IP 系统图',
  '商品与包装系统图',
  '传播与销售场景应用图',
];

function toDataUrl(image: GeneratedImage): string {
  return `data:${image.mediaType};base64,${image.bytes.toString('base64')}`;
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

async function renderDefaultCollage(images: readonly GeneratedImage[]): Promise<GeneratedImage> {
  const bytes = await createOverviewCollage(images);
  return {bytes, mediaType: 'image/png'};
}

/**
 * 原创 IP 商品化工作流。
 * 编排：视觉提取品牌 DNA → 画面规划与发布文案并行 → C-1 → C-2/3/4 并行 → 2×2 总览。
 */
export function createOriginalIpWorkflow(
  deps: OriginalIpWorkflowDependencies,
): Workflow<OriginalIpRequest, OriginalIpResult> {
  return {
    id: 'original-ip',
    async run(input, context): Promise<OriginalIpResult> {
      await reportWorkflowProgress(context, {phase: 'preparing'});
      const profile = await deps.loadIpProfile();
      if (!profile) {
        throw new ApiError(404, '尚未创建 IP 档案', 'IP_PROFILE_MISSING');
      }
      if (profile.status !== 'locked') {
        throw new ApiError(409, 'IP 档案未锁定，无法生成', 'IP_PROFILE_NOT_LOCKED');
      }
      if (profile.ipProfileId !== input.ipProfileId) {
        throw new ApiError(409, 'IP 档案已更新，请刷新后重试', 'IP_PROFILE_MISMATCH');
      }

      const [ipImage, productImage] = await Promise.all([
        deps.loadIpReferenceImage(),
        deps.loadProductImage(input.productAssetId),
      ]);

      // 提示词 A：产品图 + 产品描述 → brand_dna.json
      await reportWorkflowProgress(context, {phase: 'content'});
      const brandDnaPrompt = `${await loadPromptTemplate('brand-dna.md')}\n\n【用户产品描述】\n${input.productDescription}`;
      const dna = await generateValidatedOutput(
        () =>
          deps.providers.vision.generateJsonFromImages({
            prompt: brandDnaPrompt,
            imageDataUrls: [productImage],
            fixtureKey: ORIGINAL_IP_FIXTURE_KEYS.brandDna,
          }),
        parseBrandDna,
        'BRAND_DNA_INVALID',
      );

      // 提示词 B 与发布文案并行
      await reportWorkflowProgress(context, {phase: 'copy'});
      const [boardPlanPromptTemplate, copyPromptTemplate] = await Promise.all([
        loadPromptTemplate('board-plan.md'),
        loadPromptTemplate('copy.md'),
      ]);
      const dnaJson = JSON.stringify(dna, null, 2);
      const [plan, copy] = await Promise.all([
        generateValidatedOutput(
          () =>
            deps.providers.text.generateJson({
              prompt: boardPlanPromptTemplate.replace(
                '{{brand_dna.json 全文粘贴于此}}',
                () => dnaJson,
              ),
              fixtureKey: ORIGINAL_IP_FIXTURE_KEYS.boardPlan,
            }),
          parseBoardPlan,
          'BOARD_PLAN_INVALID',
        ),
        generateValidatedOutput(
          () =>
            deps.providers.text.generateJson({
              prompt: copyPromptTemplate
                .replace('{{product.description}}', () => input.productDescription)
                .replace('{{brand_dna.json}}', () => dnaJson),
              fixtureKey: ORIGINAL_IP_FIXTURE_KEYS.copy,
            }),
          parseOriginalIpCopy,
          'COPY_INVALID',
        ),
      ]);

      // 模板 C：确定性渲染四条生图提示词
      const prompts = await renderOriginalIpPrompts(dna, plan, profile.description);

      // C-1 是地基：失败即整次失败，不发起 C-2～C-4
      const totalImages = PAGE_ROLES.length;
      let completedImages = 0;
      await reportWorkflowProgress(context, {phase: 'images', completedImages: 0, totalImages});
      let coverImage: GeneratedImage;
      try {
        coverImage = await deps.providers.image.edit({
          prompt: prompts[0],
          size: ORIGINAL_IP_IMAGE_SIZE,
          imageDataUrls: [ipImage, productImage],
        });
      } catch (error) {
        throw toSafeError(error, '首图生成失败，请稍后重试', 'COVER_IMAGE_FAILED');
      }
      completedImages += 1;
      await reportWorkflowProgress(context, {
        phase: 'images',
        completedImages,
        totalImages,
      }).catch(() => undefined);

      // C-2/3/4 依赖 C-1 成图，并行执行
      const coverDataUrl = toDataUrl(coverImage);
      const restResults = await Promise.allSettled(
        prompts.slice(1).map(prompt =>
          deps.providers.image
            .edit({
              prompt,
              size: ORIGINAL_IP_IMAGE_SIZE,
              imageDataUrls: [ipImage, productImage, coverDataUrl],
            })
            .finally(async () => {
              completedImages += 1;
              await reportWorkflowProgress(context, {
                phase: 'images',
                completedImages,
                totalImages,
              }).catch(() => undefined);
            }),
        ),
      );
      await reportWorkflowProgress(context, {
        phase: 'finalizing',
        completedImages: totalImages,
        totalImages,
      }).catch(() => undefined);

      const images: Array<GeneratedImage | undefined> = [coverImage];
      const pageErrors: Array<string | undefined> = [undefined];
      restResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          images[index + 1] = result.value;
        } else {
          pageErrors[index + 1] = toSafeError(
            result.reason,
            '图片生成失败，请稍后重试',
            'IMAGE_FAILED',
          ).message;
        }
      });

      const pages: OriginalIpPage[] = [];
      for (let index = 0; index < PAGE_ROLES.length; index += 1) {
        const image = images[index];
        if (image) {
          const asset = await deps.saveGeneratedImage(image);
          pages.push({
            id: randomUUID(),
            role: PAGE_ROLES[index]!,
            filename: asset.filename,
            status: 'succeeded',
            imageUrl: asset.url,
            alt: PAGE_ALTS[index],
          });
        } else {
          pages.push({
            id: randomUUID(),
            role: PAGE_ROLES[index]!,
            filename: '',
            status: 'failed',
            alt: PAGE_ALTS[index],
            error: pageErrors[index] ?? '图片生成失败，请稍后重试',
          });
        }
      }

      // 2×2 总览：拼接失败只追加 warning，不影响交付
      const warnings: string[] = [];
      let overview: OriginalIpResult['overview'];
      const succeededImages = images.filter((image): image is GeneratedImage => image !== undefined);
      if (succeededImages.length > 0) {
        try {
          const collage = await (deps.createOverviewCollage ?? renderDefaultCollage)(succeededImages);
          const asset = await deps.saveGeneratedImage(collage);
          const overviewPage: OriginalIpPage = {
            id: randomUUID(),
            role: 'overview',
            filename: asset.filename,
            status: 'succeeded',
            imageUrl: asset.url,
            alt: '四图 2×2 总览',
          };
          pages.push(overviewPage);
          overview = {pageId: overviewPage.id, filename: asset.filename};
        } catch {
          warnings.push('总览图拼接失败，已跳过');
        }
      }

      const failedPages = pages.filter(page => page.status === 'failed');
      return {
        requestId: context.requestId,
        workflowId: 'original-ip',
        status: failedPages.length === 0 ? 'succeeded' : 'partial',
        pages,
        warnings,
        copy,
        ipProfileId: profile.ipProfileId,
        ipProfileVersion: profile.version,
        overview,
      };
    },
  };
}
