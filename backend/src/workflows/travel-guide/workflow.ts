import {randomUUID} from 'node:crypto';
import type {
  TravelGuideCopy,
  TravelGuidePage,
  TravelGuideRequest,
  TravelGuideResult,
} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';
import type {GeneratedImage, ProviderBundle, WebSearchResultItem} from '../../providers/contracts';
import type {StoredImageAsset} from '../../storage/assetStore';
import {reportWorkflowProgress, type Workflow} from '../contracts';
import {
  renderContentMasterPrompt,
  renderCopyPrompt,
  renderSearchContext,
  renderTravelGuideImagePrompts,
} from './promptRenderer';
import {parseTravelGuideCopy, parseTravelGuideTrip} from './schemas';

/** Mock Provider 预置数据键；真实 Provider 忽略。 */
export const TRAVEL_GUIDE_FIXTURE_KEYS = {
  trip: 'travel-guide.trip',
  copy: 'travel-guide.copy',
  search: 'travel-guide.search',
} as const;

/** 生图调用使用的竖版画幅参数；风格头内同时声明 3:4 竖版。 */
export const TRAVEL_GUIDE_IMAGE_SIZE = '1024x1536';

/** 联网检索期望返回的资料条数。 */
export const TRAVEL_GUIDE_SEARCH_COUNT = 8;

export interface TravelGuideWorkflowDependencies {
  readonly providers: ProviderBundle;
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
 * 联网检索目的地实时资料（增强能力）。
 * 任何失败都降级为空结果并记录 warning：攻略主体可按常识性建议完成，不因检索失败阻塞。
 */
async function searchDestinationContext(
  providers: ProviderBundle,
  destination: string,
): Promise<{results: WebSearchResultItem[]; warnings: string[]}> {
  try {
    const outcome = await providers.search.search({
      query: `${destination} 旅游攻略 景点 开放时间 门票 交通`,
      count: TRAVEL_GUIDE_SEARCH_COUNT,
      fixtureKey: TRAVEL_GUIDE_FIXTURE_KEYS.search,
    });
    return {results: outcome.results, warnings: []};
  } catch {
    return {
      results: [],
      warnings: ['联网检索暂不可用，本次内容基于常识性建议生成'],
    };
  }
}

const PAGE_ROLE_ALTS: Record<'cover' | 'route' | 'transport' | 'stay' | 'food', (day?: number) => string> = {
  cover: () => '攻略封面',
  route: day => `第${day ?? 1}天路线页`,
  transport: () => '交通页',
  stay: () => '住宿页',
  food: () => '美食页',
};

/**
 * 目的地手绘旅游攻略工作流。
 * 编排：联网检索（可降级）→ 提示词一内容总成（校验+重试一次、天数钳制）→
 * 渲染风格头+页型块提示词 → 文案与全部页面并行生图 → 组装结果。
 */
export function createTravelGuideWorkflow(
  deps: TravelGuideWorkflowDependencies,
): Workflow<TravelGuideRequest, TravelGuideResult> {
  return {
    id: 'travel-guide',
    async run(input, context): Promise<TravelGuideResult> {
      await reportWorkflowProgress(context, {phase: 'preparing'});
      const destination = input.destination.trim();

      // 1. 联网检索（增强能力，失败降级为空结果）
      const search = await searchDestinationContext(deps.providers, destination);

      // 2. 提示词一：地名 → 完整行程 JSON
      await reportWorkflowProgress(context, {phase: 'content'});
      const masterPrompt = await renderContentMasterPrompt(
        destination,
        renderSearchContext(search.results),
      );
      const {trip, warnings: tripWarnings} = await generateValidatedOutput(
        () =>
          deps.providers.text.generateJson({
            prompt: masterPrompt,
            fixtureKey: TRAVEL_GUIDE_FIXTURE_KEYS.trip,
          }),
        value => parseTravelGuideTrip(value, destination),
        'TRIP_INVALID',
      );

      // 3. 渲染全部生图提示词与文案提示词
      const [imagePlans, copyPrompt] = await Promise.all([
        renderTravelGuideImagePrompts(destination, trip),
        renderCopyPrompt(destination, trip),
      ]);

      // 4. 文案与全部页面并行执行；全部落定后再判定结果
      await reportWorkflowProgress(context, {phase: 'copy'});
      const copyTask: Promise<TravelGuideCopy> = generateValidatedOutput(
        () =>
          deps.providers.text.generateJson({
            prompt: copyPrompt,
            fixtureKey: TRAVEL_GUIDE_FIXTURE_KEYS.copy,
          }),
        parseTravelGuideCopy,
        'COPY_INVALID',
      );
      const totalImages = imagePlans.length;
      let completedImages = 0;
      await reportWorkflowProgress(context, {phase: 'images', completedImages: 0, totalImages});
      const imageTasks: Array<Promise<GeneratedImage>> = imagePlans.map(plan =>
        deps.providers.image
          .generate({prompt: plan.prompt, size: TRAVEL_GUIDE_IMAGE_SIZE})
          .finally(async () => {
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

      // 5. 组装结果：封面在前，路线页按天，随后交通/住宿/美食；个别页面失败标记为 partial
      const pages: TravelGuidePage[] = [];
      for (let index = 0; index < imagePlans.length; index += 1) {
        const plan = imagePlans[index]!;
        const outcome = imageOutcomes[index]!;
        const alt = PAGE_ROLE_ALTS[plan.role](plan.day);
        if (outcome.status === 'fulfilled') {
          const asset = await deps.saveGeneratedImage(outcome.value);
          pages.push({
            id: randomUUID(),
            role: plan.role,
            ...(plan.role === 'route' ? {day: plan.day} : {}),
            filename: asset.filename,
            status: 'succeeded',
            imageUrl: asset.url,
            alt,
          });
        } else {
          pages.push({
            id: randomUUID(),
            role: plan.role,
            ...(plan.role === 'route' ? {day: plan.day} : {}),
            filename: '',
            status: 'failed',
            alt,
            error: toSafeError(outcome.reason, '图片生成失败，请稍后重试', 'IMAGE_FAILED').message,
          });
        }
      }

      const failedPages = pages.filter(page => page.status === 'failed');
      return {
        requestId: context.requestId,
        workflowId: 'travel-guide',
        status: failedPages.length === 0 ? 'succeeded' : 'partial',
        pages,
        warnings: [...search.warnings, ...tripWarnings],
        copy,
        destination,
        days: trip.days,
        trip,
      };
    },
  };
}
