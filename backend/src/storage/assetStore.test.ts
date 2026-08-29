import {mkdtemp, readFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';
import {AssetStore} from './assetStore';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('asset store', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'guikesong-assets-'));
  });

  it('保存 PNG 后返回 API URL 且文件落在存储目录', async () => {
    const store = new AssetStore(baseDir);
    const asset = await store.saveImage(PNG_BYTES, 'image/png');

    expect(asset.url).toMatch(/^\/api\/generated-assets\/[\w-]+\.png$/);
    expect(asset.url).not.toContain(baseDir);
    expect(asset.url).not.toContain('Users');

    const files = await readdir(baseDir);
    expect(files).toEqual([asset.filename]);

    const stored = await readFile(path.join(baseDir, asset.filename));
    expect(stored.equals(PNG_BYTES)).toBe(true);
  });

  it('读取不存在的资产返回 null', async () => {
    const store = new AssetStore(baseDir);
    expect(await store.readImage('missing.png')).toBeNull();
  });

  it('拒绝包含路径穿越的文件名', async () => {
    const store = new AssetStore(baseDir);
    expect(await store.readImage('../secret.txt')).toBeNull();
    expect(await store.readImage('a/b.png')).toBeNull();
  });

  it('读取已保存的资产并还原媒体类型', async () => {
    const store = new AssetStore(baseDir);
    const asset = await store.saveImage(PNG_BYTES, 'image/png');

    const loaded = await store.readImage(asset.filename);
    expect(loaded?.buffer.equals(PNG_BYTES)).toBe(true);
    expect(loaded?.mediaType).toBe('image/png');
  });
});
