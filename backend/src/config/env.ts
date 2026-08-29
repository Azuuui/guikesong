import {z} from 'zod';

const providerModeSchema = z.enum(['mock', 'real']).default('mock');
const portSchema = z.coerce.number().int().positive().default(8787);

const apiKeySchema = z
  .string()
  .transform(value => value.trim())
  .refine(value => value.length > 0, 'API Key 未配置');

/**
 * 读取公开运行配置。密钥只在服务端内存中保存，
 * 任何返回值不得被序列化到响应或日志。
 */
export function loadPublicConfig(): {port: number; providerMode: 'mock' | 'real'} {
  return {
    port: portSchema.parse(process.env.PORT),
    providerMode: providerModeSchema.parse(process.env.PROVIDER_MODE),
  };
}

export interface ProviderSecrets {
  readonly copyApiBaseUrl: string;
  readonly copyApiKey: string;
  readonly copyModel: string;
  readonly copyReasoningEffort: 'low';
  readonly imageApiBaseUrl: string;
  readonly imageApiKey: string;
  readonly imageModel: string;
  readonly visionModel: string;
  /** 智谱搜索使用的引擎标识，如 search_pro。 */
  readonly searchEngine: string;
}

const providerSecretsSchema = z.object({
  COPY_API_BASE_URL: z.url(),
  COPY_API_KEY: apiKeySchema,
  COPY_MODEL: z.string().default('glm-5.3-flash'),
  COPY_REASONING_EFFORT: z.literal('low').default('low'),
  IMAGE_API_BASE_URL: z.url(),
  IMAGE_API_KEY: apiKeySchema,
  IMAGE_MODEL: z.string().default('gpt-image-2'),
  VISION_MODEL: z.string().default('gpt-image-2'),
  SEARCH_ENGINE: z.string().default('search_pro'),
});

/**
 * 读取真实 Provider 密钥。仅在 PROVIDER_MODE=real 时调用；
 * 返回对象禁止出现在错误消息、日志和 HTTP 响应中。
 */
export function loadProviderSecrets(): ProviderSecrets {
  const raw = providerSecretsSchema.parse({
    COPY_API_BASE_URL: process.env.COPY_API_BASE_URL,
    COPY_API_KEY: process.env.COPY_API_KEY,
    COPY_MODEL: process.env.COPY_MODEL,
    COPY_REASONING_EFFORT: process.env.COPY_REASONING_EFFORT,
    IMAGE_API_BASE_URL: process.env.IMAGE_API_BASE_URL,
    IMAGE_API_KEY: process.env.IMAGE_API_KEY,
    IMAGE_MODEL: process.env.IMAGE_MODEL,
    VISION_MODEL: process.env.VISION_MODEL,
    SEARCH_ENGINE: process.env.SEARCH_ENGINE,
  });
  return {
    copyApiBaseUrl: raw.COPY_API_BASE_URL,
    copyApiKey: raw.COPY_API_KEY,
    copyModel: raw.COPY_MODEL,
    copyReasoningEffort: raw.COPY_REASONING_EFFORT,
    imageApiBaseUrl: raw.IMAGE_API_BASE_URL,
    imageApiKey: raw.IMAGE_API_KEY,
    imageModel: raw.IMAGE_MODEL,
    visionModel: raw.VISION_MODEL,
    searchEngine: raw.SEARCH_ENGINE,
  };
}
