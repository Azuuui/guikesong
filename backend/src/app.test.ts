// @vitest-environment node
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
