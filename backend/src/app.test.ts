// @vitest-environment node
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {createApp} from './app';

describe('app health', () => {
  it('只返回非敏感健康信息', async () => {
    const response = await request(createApp()).get('/api/health').expect(200);
    expect(response.body).toEqual({ok: true, mode: 'mock'});
    expect(JSON.stringify(response.body)).not.toMatch(/key|token|authorization/i);
  });
});

describe('app generation jobs', () => {
  it('默认应用提供后台任务接口并完成 Mock 生成', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'guikesong-app-jobs-'));
    const app = createApp({providerMode: 'mock', dataDir});

    const response = await request(app)
      .post('/api/generation-jobs')
      .send({workflowId: 'xhs-atlas', topic: '贵阳的12种美食', referenceAssetIds: []})
      .expect(202);
    expect(response.body).toMatchObject({status: 'queued'});

    const deadline = Date.now() + 30_000;
    for (;;) {
      const snapshot = await request(app)
        .get(`/api/generation-jobs/${response.body.jobId}`)
        .expect(200);
      expect(snapshot.body.jobId).toBe(response.body.jobId);
      if (['succeeded', 'partial', 'failed'].includes(snapshot.body.status)) {
        expect(snapshot.body.status).toBe('succeeded');
        expect(snapshot.body.result).toMatchObject({workflowId: 'xhs-atlas'});
        expect(snapshot.body.error).toBeNull();
        expect(JSON.stringify(snapshot.body)).not.toMatch(/prompt|apiKey|\/Users\//);
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`任务未在时限内进入终态，当前状态 ${snapshot.body.status}`);
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }, 60_000);
});
