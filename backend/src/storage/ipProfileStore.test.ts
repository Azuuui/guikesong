import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';
import {IpProfileStore} from './ipProfileStore';

const PROFILE_INPUT = {
  name: '山湖精灵',
  referenceImageUrl: '/api/reference-assets/ip-figure',
  description: '青绿山水风格的 IP 形象',
};

describe('ip profile store', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'guikesong-ip-profile-'));
  });

  it('创建后读取 version 为 1 且持久化为 profile.json', async () => {
    const store = new IpProfileStore(baseDir);
    const created = await store.save(PROFILE_INPUT);

    expect(created.version).toBe(1);
    expect(created.status).toBe('draft');
    expect(created.name).toBe('山湖精灵');

    const read = await store.read();
    expect(read).toEqual(created);

    const raw = await readFile(path.join(baseDir, 'profile.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(created);
  });

  it('更新后 version+1 且 ipProfileId 不变', async () => {
    const store = new IpProfileStore(baseDir);
    const created = await store.save(PROFILE_INPUT);

    const updated = await store.save({...PROFILE_INPUT, name: '山湖精灵·新版'});

    expect(updated.ipProfileId).toBe(created.ipProfileId);
    expect(updated.version).toBe(2);
    expect(updated.name).toBe('山湖精灵·新版');
    expect((await store.read())?.version).toBe(2);
  });

  it('锁定后再次更新抛出业务错误', async () => {
    const store = new IpProfileStore(baseDir);
    await store.save(PROFILE_INPUT);
    const locked = await store.lock();

    expect(locked.status).toBe('locked');

    await expect(store.save({...PROFILE_INPUT, name: '不该生效'})).rejects.toThrow('已锁定');

    const after = await store.read();
    expect(after?.name).toBe('山湖精灵');
    expect(after?.status).toBe('locked');
  });

  it('锁定不存在的档案抛出业务错误', async () => {
    const store = new IpProfileStore(baseDir);
    await expect(store.lock()).rejects.toThrow('尚未创建');
  });
});
