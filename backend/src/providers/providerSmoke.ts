/**
 * 真实 Provider 能力探测脚本。
 * 只输出：模型名、能力名、成功/失败、HTTP 状态和安全错误码。
 * 禁止输出请求头、环境变量、图片 Base64 或完整上游响应。
 * 顺序：智谱最小 JSON → 智谱 web 搜索 → 中转站视觉 JSON → gpt-image-2 最小生成 → 两张 1×1 图 edits。
 */
import 'dotenv/config';
import {loadProviderSecrets, loadPublicConfig} from '../config/env';
import {createProviders} from './providerFactory';
import type {ProviderBundle} from './contracts';

interface SmokeStepResult {
  capability: string;
  model: string;
  ok: boolean;
  httpStatus?: number;
  errorCode?: string;
}

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function extractHttpStatus(error: unknown): number | undefined {
  const status = (error as {status?: unknown} | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

function extractErrorCode(error: unknown): string | undefined {
  const code = (error as {code?: unknown} | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

async function runStep(
  capability: string,
  model: string,
  action: () => Promise<void>,
): Promise<SmokeStepResult> {
  try {
    await action();
    return {capability, model, ok: true};
  } catch (error) {
    return {
      capability,
      model,
      ok: false,
      httpStatus: extractHttpStatus(error),
      errorCode: extractErrorCode(error),
    };
  }
}

async function assertJsonShape(value: unknown): Promise<void> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('返回内容不是 JSON 对象');
  }
}

async function main(): Promise<void> {
  const {providerMode} = loadPublicConfig();
  if (providerMode !== 'real') {
    console.error('请先将 PROVIDER_MODE 设置为 real 再运行冒烟脚本');
    process.exit(1);
  }

  const secrets = loadProviderSecrets();
  const providers: ProviderBundle = createProviders({providerMode: 'real', secrets});

  const results: SmokeStepResult[] = [];

  results.push(
    await runStep('智谱最小 JSON', secrets.copyModel, async () => {
      const json = await providers.text.generateJson({prompt: '只返回 JSON：{"ok": true}'});
      await assertJsonShape(json);
    }),
  );

  results.push(
    await runStep('智谱 web 搜索', secrets.searchEngine, async () => {
      const outcome = await providers.search.search({query: '杭州 西湖 旅游攻略', count: 3});
      if (outcome.results.length === 0) {
        throw new Error('搜索未返回任何结果');
      }
      for (const item of outcome.results) {
        if (!item.title || !item.link) {
          throw new Error('搜索结果缺少标题或链接');
        }
      }
    }),
  );

  const onePixelDataUrl = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`;

  results.push(
    await runStep('中转站视觉 JSON', secrets.visionModel, async () => {
      const json = await providers.vision.generateJsonFromImages({
        prompt: '这张图的主色调是什么？只返回 JSON：{"color":"..."}',
        imageDataUrls: [onePixelDataUrl],
      });
      await assertJsonShape(json);
    }),
  );

  results.push(
    await runStep('gpt-image-2 最小生成', secrets.imageModel, async () => {
      const image = await providers.image.generate({prompt: '一张纯色测试图', size: '1024x1024'});
      if (image.bytes.length === 0) {
        throw new Error('返回空图片');
      }
    }),
  );

  results.push(
    await runStep('gpt-image-2 双图 edits', secrets.imageModel, async () => {
      const image = await providers.image.edit({
        prompt: '把第二张图的内容风格参考第一张图，输出一张测试合成图',
        size: '1024x1024',
        imageDataUrls: [onePixelDataUrl, onePixelDataUrl],
      });
      if (image.bytes.length === 0) {
        throw new Error('返回空图片');
      }
    }),
  );

  let failed = false;
  for (const result of results) {
    const status = result.ok
      ? '成功'
      : `失败 HTTP=${result.httpStatus ?? '无'} 错误码=${result.errorCode ?? 'UNKNOWN'}`;
    console.log(`[${result.capability}] 模型=${result.model} 状态=${status}`);
    if (!result.ok) failed = true;
  }

  if (failed) {
    console.error('能力探测存在失败项');
    process.exit(1);
  }
  console.log('全部能力探测通过');
}

void main();
