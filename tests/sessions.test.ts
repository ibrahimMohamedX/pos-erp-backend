import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/common/prisma.js';

let app: FastifyInstance;
const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const email = `session_${suffix}@test.local`;
const password = 'Passw0rd!';
let token = '';
let companyId = 0;
let sessionId = 0;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  const company = await prisma.company.create({ data: { name: `Session Co ${suffix}` } });
  companyId = company.id;
  await prisma.user.create({
    data: {
      name: 'Session User',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      companies: { create: { companyId: company.id, role: 'cashier', isDefault: true } }
    }
  });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  token = login.json().data.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
  await app.close();
});

const authH = () => ({ authorization: `Bearer ${token}` });

describe('POST /pos/sessions', () => {
  it('opens a session with cash drawer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/sessions',
      headers: authH(),
      payload: { opening_cash: 500 }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    sessionId = body.data.id;
    expect(body.data.opening_cash).toBe(500);
    expect(body.data.status).toBe('open');
  });
});

describe('GET /pos/sessions', () => {
  it('lists company sessions', async () => {
    const res = await app.inject({ method: 'GET', url: '/pos/sessions', headers: authH() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].id).toBe(sessionId);
    expect(body.data[0].status).toBe('open');
  });
});

describe('GET /pos/report/close-out', () => {
  it('returns session detail with summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/pos/report/close-out?session_id=${sessionId}`,
      headers: authH()
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.data.session.id).toBe(sessionId);
    expect(body.data.summary).toBeDefined();
    expect(body.data.cash_drawer).toBeDefined();
    expect(body.data.print_url).toBeDefined();
  });

  it('requires session_id', async () => {
    const res = await app.inject({ method: 'GET', url: '/pos/report/close-out', headers: authH() });
    expect(res.statusCode).toBe(400);
  });

  it('404 for missing session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/pos/report/close-out?session_id=999999',
      headers: authH()
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /pos/report/end-day', () => {
  it('closes the day for a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/report/end-day',
      headers: authH(),
      payload: { session_id: sessionId, opening_cash: 200 }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('closed');
    expect(body.data.summary).toBeDefined();
  });

  it('rejects closing an already closed session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/report/end-day',
      headers: authH(),
      payload: { session_id: sessionId }
    });
    expect(res.statusCode).toBe(409);
  });
});
