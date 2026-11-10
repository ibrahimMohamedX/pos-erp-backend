import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns ok when database is reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });
});

describe('error envelope', () => {
  it('returns legacy error envelope for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/definitely-missing' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.status).toBe(false);
    expect(body.error).toBeDefined();
  });
});
