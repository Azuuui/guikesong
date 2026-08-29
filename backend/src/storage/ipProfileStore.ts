import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {IpProfile} from '../../../shared/workflows';
import {ApiError} from '../http/apiError';

export interface IpProfileInput {
  name: string;
  referenceImageUrl: string;
  description: string;
}

/** 单个全局 IP Profile 的持久化存储（data/ip-profiles/profile.json）。 */
export class IpProfileStore {
  private readonly profilePath: string;

  constructor(baseDir: string) {
    this.profilePath = path.join(baseDir, 'profile.json');
  }

  async read(): Promise<IpProfile | null> {
    try {
      const raw = await fs.readFile(this.profilePath, 'utf8');
      return JSON.parse(raw) as IpProfile;
    } catch {
      return null;
    }
  }

  /** 创建或更新档案；已锁定档案抛出业务错误。 */
  async save(input: IpProfileInput): Promise<IpProfile> {
    const existing = await this.read();
    if (existing?.status === 'locked') {
      throw new ApiError(409, 'IP 档案已锁定，无法修改', 'IP_PROFILE_LOCKED');
    }

    const now = new Date().toISOString();
    const profile: IpProfile = existing
      ? {
          ...existing,
          name: input.name,
          referenceImageUrl: input.referenceImageUrl,
          description: input.description,
          version: existing.version + 1,
          updatedAt: now,
        }
      : {
          ipProfileId: randomUUID(),
          version: 1,
          name: input.name,
          referenceImageUrl: input.referenceImageUrl,
          description: input.description,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        };

    await fs.mkdir(path.dirname(this.profilePath), {recursive: true});
    await fs.writeFile(this.profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    return profile;
  }

  async lock(): Promise<IpProfile> {
    const existing = await this.read();
    if (!existing) {
      throw new ApiError(404, '尚未创建 IP 档案', 'IP_PROFILE_MISSING');
    }
    if (existing.status === 'locked') return existing;

    const locked: IpProfile = {...existing, status: 'locked', updatedAt: new Date().toISOString()};
    await fs.writeFile(this.profilePath, `${JSON.stringify(locked, null, 2)}\n`, 'utf8');
    return locked;
  }
}
