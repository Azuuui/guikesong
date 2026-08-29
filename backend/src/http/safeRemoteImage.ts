import dns from 'node:dns/promises';
import net from 'node:net';
import {ApiError} from './apiError';
import type {FetchLike} from './fetchWithTimeout';

export type RemoteImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface RemoteImage {
  bytes: Buffer;
  mediaType: RemoteImageMediaType;
}

export interface RemoteImageOptions {
  fetchImpl?: FetchLike;
  /** 域名解析函数，测试注入用。 */
  lookup?: (hostname: string) => Promise<{address: string}>;
  maxBytes?: number;
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  );
}

function parseHttpsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(502, '图片地址无效', 'REMOTE_IMAGE_INVALID_URL');
  }
  if (url.protocol !== 'https:') {
    throw new ApiError(502, '仅支持 https 图片地址', 'REMOTE_IMAGE_NOT_HTTPS');
  }
  return url;
}

async function assertHostAllowed(
  hostname: string,
  lookup: (hostname: string) => Promise<{address: string}>,
): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new ApiError(502, '不允许下载本机图片', 'REMOTE_IMAGE_HOST_BLOCKED');
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new ApiError(502, '不允许下载内网图片', 'REMOTE_IMAGE_HOST_BLOCKED');
    }
    return;
  }
  const resolved = await lookup(host);
  if (isPrivateAddress(resolved.address)) {
    throw new ApiError(502, '不允许下载内网图片', 'REMOTE_IMAGE_HOST_BLOCKED');
  }
}

function parseMediaType(contentType: string | null): RemoteImageMediaType {
  const base = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
  if (base === 'image/png' || base === 'image/jpeg' || base === 'image/webp') return base;
  throw new ApiError(502, '图片格式不受支持', 'REMOTE_IMAGE_UNSUPPORTED_TYPE');
}

/**
 * 安全下载远程图片：
 * 仅 https、拒绝环回/私网、最多 3 次重定向、大小上限 25MB。
 */
export async function fetchRemoteImage(
  rawUrl: string,
  options: RemoteImageOptions = {},
): Promise<RemoteImage> {
  const doFetch = options.fetchImpl ?? fetch;
  const lookup = options.lookup ?? ((hostname: string) => dns.lookup(hostname));
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  let current = parseHttpsUrl(rawUrl);

  for (let redirects = 0; ; redirects += 1) {
    await assertHostAllowed(current.hostname, lookup);
    const response = await doFetch(current.href, {redirect: 'manual'});

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (redirects >= MAX_REDIRECTS || !location) {
        throw new ApiError(502, '图片下载失败：重定向次数过多', 'REMOTE_IMAGE_TOO_MANY_REDIRECTS');
      }
      current = parseHttpsUrl(new URL(location, current.href).href);
      continue;
    }

    if (!response.ok) {
      throw new ApiError(502, '图片下载失败', 'REMOTE_IMAGE_STATUS');
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > maxBytes) {
      throw new ApiError(502, '图片超过 25MB 大小限制', 'REMOTE_IMAGE_TOO_LARGE');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new ApiError(502, '图片内容为空', 'REMOTE_IMAGE_EMPTY');
    }
    if (bytes.length > maxBytes) {
      throw new ApiError(502, '图片超过 25MB 大小限制', 'REMOTE_IMAGE_TOO_LARGE');
    }

    return {bytes, mediaType: parseMediaType(response.headers.get('content-type'))};
  }
}
