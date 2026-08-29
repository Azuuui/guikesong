// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';
import {HttpTimeoutError} from '../http/fetchWithTimeout';
import {fetchRemoteImage} from '../http/safeRemoteImage';
import {createProviders} from './providerFactory';
import {
  MockImageProvider,
  MockSearchProvider,
  MockTextProvider,
  MockVisionProvider,
} from './mockProviders';
import {RelayImageProvider} from './relayImageProvider';
import {RelayVisionProvider} from './relayVisionProvider';
import {UnavailableSearchProvider} from './unavailableSearchProvider';
import {ZhipuSearchProvider} from './zhipuSearchProvider';
import {ZhipuTextProvider} from './zhipuTextProvider';

const ZHIPU_CONFIG = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: 'test-key',
  model: 'glm-5.3-flash',
};

const RELAY_CONFIG = {
  baseUrl: 'https://relay.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-image-2',
};

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64');

const publicLookup = async () => ({address: '93.184.216.34'});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('zhipu text provider', () => {
  it('请求携带 model/thinking/reasoning_effort/stream 并解析 JSON', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({choices: [{message: {content: '{"title":"测试"}'}}]}),
    );
    const provider = new ZhipuTextProvider({...ZHIPU_CONFIG, fetchImpl});

    await expect(provider.generateJson({prompt: '生成文案'})).resolves.toEqual({title: '测试'});

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe('glm-5.3-flash');
    expect(body.thinking).toEqual({type: 'enabled'});
    expect(body.reasoning_effort).toBe('low');
    expect(body.stream).toBe(false);
    expect(String(new Headers(init!.headers).get('authorization'))).toContain('Bearer ');
  });

  it('支持 markdown 围栏包裹的 JSON', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({choices: [{message: {content: '```json\n{"ok":true}\n```'}}]}),
    );
    const provider = new ZhipuTextProvider({...ZHIPU_CONFIG, fetchImpl});
    await expect(provider.generateJson({prompt: 'x'})).resolves.toEqual({ok: true});
  });

  it('429 与 5xx 返回安全错误且不泄露密钥或上游正文', async () => {
    for (const status of [429, 500]) {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({error: {message: 'UPSTREAM-SECRET test-key detail'}}, status),
      );
      const provider = new ZhipuTextProvider({...ZHIPU_CONFIG, fetchImpl});

      const error = await provider.generateJson({prompt: 'x'}).then(
        () => undefined,
        (e: Error) => e,
      );
      expect(error).toBeInstanceOf(Error);
      const message = error!.message;
      expect(message).not.toContain('test-key');
      expect(message).not.toContain('UPSTREAM-SECRET');
      expect(message).not.toContain('Bearer');
    }
  });

  it('非 JSON 内容返回安全错误', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({choices: [{message: {content: '这不是 JSON'}}]}),
    );
    const provider = new ZhipuTextProvider({...ZHIPU_CONFIG, fetchImpl});
    await expect(provider.generateJson({prompt: 'x'})).rejects.toThrow('JSON');
  });

  it('文本请求 30 秒超时', async () => {
    vi.useFakeTimers();
    const provider = new ZhipuTextProvider({...ZHIPU_CONFIG, fetchImpl: hangingFetch()});

    const pending = provider.generateJson({prompt: 'x'});
    const assertion = expect(pending).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});

describe('zhipu search provider', () => {
  it('请求携带 search_query/search_engine/count 并过滤非法结果', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        search_result: [
          {
            title: '西湖游玩攻略',
            content: '西湖位于杭州市西湖区，环湖步行约半日。',
            link: 'https://example.com/west-lake',
            media: '携程',
            publish_date: '2026-08-01',
          },
          {title: '', content: '缺失标题', link: 'https://example.com/bad'},
          {title: '缺内容', content: '', link: 'https://example.com/bad2'},
        ],
      }),
    );
    const provider = new ZhipuSearchProvider({...ZHIPU_CONFIG, fetchImpl});

    const outcome = await provider.search({query: '杭州西湖攻略', count: 3});

    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]).toEqual({
      title: '西湖游玩攻略',
      content: '西湖位于杭州市西湖区，环湖步行约半日。',
      link: 'https://example.com/west-lake',
      media: '携程',
      publishDate: '2026-08-01',
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://open.bigmodel.cn/api/paas/v4/web_search');
    const body = JSON.parse(String(init!.body));
    expect(body.search_query).toBe('杭州西湖攻略');
    expect(body.search_engine).toBe('search_pro');
    expect(body.count).toBe(3);
    expect(String(new Headers(init!.headers).get('authorization'))).toContain('Bearer ');
  });

  it('支持自定义搜索引擎', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({search_result: []}),
    );
    const provider = new ZhipuSearchProvider({...ZHIPU_CONFIG, fetchImpl, searchEngine: 'search_std'});

    await provider.search({query: 'x'});

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(String(init!.body)).search_engine).toBe('search_std');
  });

  it('count 缺省为 8、超过 50 钳制为 50', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({search_result: []}),
    );
    const provider = new ZhipuSearchProvider({...ZHIPU_CONFIG, fetchImpl});

    await provider.search({query: 'x'});
    await provider.search({query: 'x', count: 99});

    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init!.body)));
    expect(bodies[0]!.count).toBe(8);
    expect(bodies[1]!.count).toBe(50);
  });

  it('429 与 5xx 返回安全错误且不泄露密钥或上游正文', async () => {
    for (const status of [429, 500]) {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({error: {message: 'UPSTREAM-SECRET test-key detail'}}, status),
      );
      const provider = new ZhipuSearchProvider({...ZHIPU_CONFIG, fetchImpl});

      const error = await provider.search({query: 'x'}).then(
        () => undefined,
        (e: Error) => e,
      );
      expect(error).toBeInstanceOf(Error);
      const message = error!.message;
      expect(message).not.toContain('test-key');
      expect(message).not.toContain('UPSTREAM-SECRET');
      expect(message).not.toContain('Bearer');
    }
  });

  it('search_result 缺失时返回安全错误', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const provider = new ZhipuSearchProvider({...ZHIPU_CONFIG, fetchImpl});
    await expect(provider.search({query: 'x'})).rejects.toThrow('搜索服务返回了无法解析的内容');
  });

  it('搜索请求 30 秒超时', async () => {
    vi.useFakeTimers();
    const provider = new ZhipuSearchProvider({...ZHIPU_CONFIG, fetchImpl: hangingFetch()});

    const pending = provider.search({query: 'x'});
    const assertion = expect(pending).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});

describe('relay image provider', () => {
  it('文生图使用 gpt-image-2 并支持 b64_json 响应', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({data: [{b64_json: TINY_PNG_BASE64}]}),
    );
    const provider = new RelayImageProvider({...RELAY_CONFIG, fetchImpl});

    const image = await provider.generate({prompt: '一张测试图', size: '1024x1024'});

    expect(image.bytes.equals(TINY_PNG_BYTES)).toBe(true);
    expect(image.mediaType).toBe('image/png');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://relay.example.com/v1/images/generations');
    expect(JSON.parse(String(init!.body)).model).toBe('gpt-image-2');
  });

  it('支持 HTTPS URL 响应并安全下载', async () => {
    const fetchImpl = vi
      .fn(async (_url: string, _init?: RequestInit) => new Response(null))
      .mockResolvedValueOnce(jsonResponse({data: [{url: 'https://cdn.example.com/image.png'}]}))
      .mockResolvedValueOnce(
        new Response(TINY_PNG_BYTES, {headers: {'content-type': 'image/png'}}),
      );
    const provider = new RelayImageProvider({...RELAY_CONFIG, fetchImpl, lookup: publicLookup});

    const image = await provider.generate({prompt: 'x', size: '1024x1024'});

    expect(image.bytes.equals(TINY_PNG_BYTES)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('edits 使用 multipart 且保持参考图顺序', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({data: [{b64_json: TINY_PNG_BASE64}]}),
    );
    const provider = new RelayImageProvider({...RELAY_CONFIG, fetchImpl});

    const otherPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const first = `data:image/png;base64,${TINY_PNG_BASE64}`;
    const second = `data:image/png;base64,${otherPng.toString('base64')}`;

    await provider.edit({
      prompt: '把产品放进场景',
      size: '1024x1024',
      imageDataUrls: [first, second],
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://relay.example.com/v1/images/edits');

    const form = init!.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('model')).toBe('gpt-image-2');
    expect(form.get('prompt')).toBe('把产品放进场景');
    const files = form.getAll('image') as File[];
    expect(files).toHaveLength(2);
    expect(files[0]!.name).toBe('reference-0.png');
    expect(files[1]!.name).toBe('reference-1.png');
    expect(Buffer.from(await files[0]!.arrayBuffer()).equals(TINY_PNG_BYTES)).toBe(true);
    expect(Buffer.from(await files[1]!.arrayBuffer()).equals(otherPng)).toBe(true);
  });

  it('空图片数据返回安全错误', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({data: []}));
    const provider = new RelayImageProvider({...RELAY_CONFIG, fetchImpl});
    const error = await provider.generate({prompt: 'x', size: '1024x1024'}).then(
      () => undefined,
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).not.toContain('relay.example.com');
  });

  it('单次图片请求 180 秒超时', async () => {
    vi.useFakeTimers();
    const provider = new RelayImageProvider({...RELAY_CONFIG, fetchImpl: hangingFetch()});

    const pending = provider.generate({prompt: 'x', size: '1024x1024'});
    const assertion = expect(pending).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(180_000);
    await assertion;
  });
});

describe('relay vision provider', () => {
  it('把图片以 image_url 形式传入并解析 JSON', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({choices: [{message: {content: '{"color":"白色"}'}}]}),
    );
    const provider = new RelayVisionProvider({...RELAY_CONFIG, fetchImpl});

    const result = await provider.generateJsonFromImages({
      prompt: '这张图是什么颜色？返回 JSON',
      imageDataUrls: [`data:image/png;base64,${TINY_PNG_BASE64}`],
    });

    expect(result).toEqual({color: '白色'});
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe('gpt-image-2');
    expect(
      String(body.messages[0].content[1].image_url.url).startsWith('data:image/png;base64,'),
    ).toBe(true);
    expect(body.stream).toBe(false);
  });
});

describe('safe remote image', () => {
  it('拒绝 http: URL', async () => {
    await expect(fetchRemoteImage('http://cdn.example.com/a.png')).rejects.toThrow('https');
  });

  it('拒绝 localhost 与内网主机', async () => {
    await expect(fetchRemoteImage('https://localhost/a.png')).rejects.toThrow();
    await expect(fetchRemoteImage('https://internal.local/a.png')).rejects.toThrow();
  });

  it('拒绝解析到私网地址的主机', async () => {
    await expect(
      fetchRemoteImage('https://internal.example.com/a.png', {
        lookup: async () => ({address: '10.0.0.5'}),
      }),
    ).rejects.toThrow();
    await expect(
      fetchRemoteImage('https://loopback.example.com/a.png', {
        lookup: async () => ({address: '127.0.0.1'}),
      }),
    ).rejects.toThrow();
  });

  it('拒绝环回字面 IP', async () => {
    await expect(fetchRemoteImage('https://127.0.0.1/a.png')).rejects.toThrow();
  });

  it('超过 3 次重定向失败', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {status: 302, headers: {location: 'https://cdn.example.com/next.png'}}),
    );
    await expect(
      fetchRemoteImage('https://cdn.example.com/a.png', {fetchImpl, lookup: publicLookup}),
    ).rejects.toThrow('重定向');
  });

  it('重定向必须保持 https', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, {status: 302, headers: {location: 'http://evil.example.com/a.png'}}),
    );
    await expect(
      fetchRemoteImage('https://cdn.example.com/a.png', {fetchImpl, lookup: publicLookup}),
    ).rejects.toThrow('https');
  });

  it('超过 25MB 失败', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(Buffer.alloc(26 * 1024 * 1024), {
          headers: {'content-type': 'image/png'},
        }),
    );
    await expect(
      fetchRemoteImage('https://cdn.example.com/big.png', {fetchImpl, lookup: publicLookup}),
    ).rejects.toThrow('25MB');
  });

  it('空图片失败', async () => {
    const fetchImpl = vi.fn(async () => new Response(Buffer.alloc(0), {headers: {'content-type': 'image/png'}}));
    await expect(fetchRemoteImage('https://cdn.example.com/empty.png', {fetchImpl})).rejects.toThrow();
  });
});

describe('mock providers', () => {
  it('文本按 fixtureKey 返回深拷贝预置 JSON', async () => {
    const fixture = {title: 't', items: [{id: 1}]};
    const provider = new MockTextProvider({'demo.copy': fixture});

    const first = await provider.generateJson({prompt: 'x', fixtureKey: 'demo.copy'});
    const second = await provider.generateJson({prompt: 'x', fixtureKey: 'demo.copy'});
    expect(first).toEqual(fixture);
    expect(second).toEqual(fixture);
    expect(first).not.toBe(fixture);
    (first as {items: unknown[]}).items.push({id: 2});
    expect((second as {items: unknown[]}).items).toHaveLength(1);

    await expect(provider.generateJson({prompt: 'x', fixtureKey: 'missing'})).rejects.toThrow('Mock');
  });

  it('视觉 Mock 按 fixtureKey 返回预置 JSON', async () => {
    const provider = new MockVisionProvider({'demo.vision': {ok: true}});
    await expect(
      provider.generateJsonFromImages({
        prompt: 'x',
        imageDataUrls: [`data:image/png;base64,${TINY_PNG_BASE64}`],
        fixtureKey: 'demo.vision',
      }),
    ).resolves.toEqual({ok: true});
  });

  it('搜索 Mock 按 fixtureKey 返回深拷贝并按 count 截断', async () => {
    const rawFixture = {
      results: [
        {title: '结果一', content: '内容一', link: 'https://example.com/1'},
        {title: '结果二', content: '内容二', link: 'https://example.com/2'},
        {title: '结果三', content: '内容三', link: 'https://example.com/3'},
      ],
    };
    const provider = new MockSearchProvider({'demo.search': rawFixture});

    const first = await provider.search({query: 'x', count: 2, fixtureKey: 'demo.search'});
    const second = await provider.search({query: 'x', fixtureKey: 'demo.search'});

    expect(first.results.map(item => item.title)).toEqual(['结果一', '结果二']);
    expect(second.results.map(item => item.title)).toEqual(['结果一', '结果二', '结果三']);

    rawFixture.results[0]!.title = '污染源数据';
    expect(first.results[0]!.title).toBe('结果一');

    await expect(provider.search({query: 'x', fixtureKey: 'missing'})).rejects.toThrow('Mock');
  });

  it('Unavailable 搜索抛 SEARCH_UNAVAILABLE 业务错误', async () => {
    const provider = new UnavailableSearchProvider();
    const error = await provider.search({query: 'x'}).then(
      () => undefined,
      (e: {message: string; code?: unknown; status?: unknown}) => e,
    );
    expect(error?.message).toBe('搜索服务未配置');
    expect(error?.code).toBe('SEARCH_UNAVAILABLE');
    expect(error?.status).toBe(503);
  });

  it('图片 Mock 确定性输出 PNG 且不触网', async () => {
    const provider = new MockImageProvider();
    const a = await provider.generate({prompt: '封面', size: '1024x1024'});
    const b = await provider.generate({prompt: '封面', size: '1024x1024'});
    const c = await provider.edit({
      prompt: '产品图',
      size: '1024x1024',
      imageDataUrls: [`data:image/png;base64,${TINY_PNG_BASE64}`],
    });

    expect(a.mediaType).toBe('image/png');
    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(c.bytes.length).toBeGreaterThan(0);
  });
});

describe('provider factory', () => {
  it('mock 模式返回 Mock Provider', () => {
    const bundle = createProviders({providerMode: 'mock'});
    expect(bundle.text).toBeInstanceOf(MockTextProvider);
    expect(bundle.vision).toBeInstanceOf(MockVisionProvider);
    expect(bundle.image).toBeInstanceOf(MockImageProvider);
    expect(bundle.search).toBeInstanceOf(MockSearchProvider);
  });

  it('real 模式返回真实 Provider', () => {
    const bundle = createProviders({
      providerMode: 'real',
      secrets: {
        copyApiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        copyApiKey: 'k',
        copyModel: 'glm-5.3-flash',
        copyReasoningEffort: 'low',
        imageApiBaseUrl: 'https://relay.example.com/v1',
        imageApiKey: 'k',
        imageModel: 'gpt-image-2',
        visionModel: 'gpt-image-2',
        searchEngine: 'search_pro',
      },
    });
    expect(bundle.text).toBeInstanceOf(ZhipuTextProvider);
    expect(bundle.vision).toBeInstanceOf(RelayVisionProvider);
    expect(bundle.image).toBeInstanceOf(RelayImageProvider);
    expect(bundle.search).toBeInstanceOf(ZhipuSearchProvider);
  });
});

describe('fetchWithTimeout', () => {
  it('超时抛出 HttpTimeoutError', async () => {
    vi.useFakeTimers();
    const {fetchWithTimeout} = await import('../http/fetchWithTimeout');
    const pending = fetchWithTimeout('https://example.com', {}, 1_000, hangingFetch());
    const assertion = expect(pending).rejects.toBeInstanceOf(HttpTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });
});
