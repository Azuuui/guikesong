import {loadProviderSecrets} from '../config/env';
import {MockImageProvider, MockTextProvider, MockVisionProvider} from './mockProviders';
import {RelayImageProvider} from './relayImageProvider';
import {RelayVisionProvider} from './relayVisionProvider';
import type {FetchLike} from '../http/fetchWithTimeout';
import type {MockFixtures, ProviderBundle} from './contracts';
import type {ProviderSecrets} from '../config/env';
import {ZhipuTextProvider} from './zhipuTextProvider';

export interface ProviderFactoryConfig {
  providerMode: 'mock' | 'real';
  /** 真实模式密钥；缺省时从环境变量读取。 */
  secrets?: ProviderSecrets;
  fetchImpl?: FetchLike;
  fixtures?: MockFixtures;
}

/**
 * Provider 工厂：Workflow 只依赖接口，不读取 process.env。
 * mock → 确定性 Mock；real → 智谱 + 中转站。
 */
export function createProviders(config: ProviderFactoryConfig): ProviderBundle {
  if (config.providerMode === 'mock') {
    return {
      text: new MockTextProvider(config.fixtures?.text),
      vision: new MockVisionProvider(config.fixtures?.vision),
      image: new MockImageProvider(),
    };
  }

  const secrets = config.secrets ?? loadProviderSecrets();
  return {
    text: new ZhipuTextProvider({
      baseUrl: secrets.copyApiBaseUrl,
      apiKey: secrets.copyApiKey,
      model: secrets.copyModel,
      fetchImpl: config.fetchImpl,
    }),
    vision: new RelayVisionProvider({
      baseUrl: secrets.imageApiBaseUrl,
      apiKey: secrets.imageApiKey,
      model: secrets.visionModel,
      fetchImpl: config.fetchImpl,
    }),
    image: new RelayImageProvider({
      baseUrl: secrets.imageApiBaseUrl,
      apiKey: secrets.imageApiKey,
      model: secrets.imageModel,
      fetchImpl: config.fetchImpl,
    }),
  };
}
