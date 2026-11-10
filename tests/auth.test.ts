import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/common/prisma.js';

let app: FastifyInstance;
const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const email = `cashier_${suffix}@test.local`;
const password = 'Passw0rd!';
let token = '';
let companyId = 0;

async function seed() {
  const company = await prisma.company.create({ data: { name: `Acme ${suffix}` } });
  companyId = company.id;
  const user = await prisma.user.create({
    data: {
      name: 'Test Cashier',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      companies: { create: { companyId: company.id, role: 'cashier', isDefault: true } }
    }
  });
  await prisma.branch.create({ data: { companyId: company.id, name: 'Main' } });
  return user;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  await seed();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await app.close();
});

describe('POST /auth/login', () => {
  it('returns legacy envelope with user, token and refresh_token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.message).toBe('login_successful');
    expect(body.data.user.email).toBe(email);
    expect(typeof body.data.token).toBe('string');
    expect(body.data.refresh_token).toBeDefined();
    token = body.data.token;
  });

  it('rejects wrong password with 401 legacy envelope', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'wrong' } });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.status).toBe(false);
    expect(body.error.code).toBe('auth_failed');
  });

  it('rejects invalid body with 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('company pin', () => {
  it('set then verify pin', async () => {
    const setRes = await app.inject({
      method: 'POST',
      url: '/add/company/pin',
      headers: { authorization: `Bearer ${token}` },
      payload: { pin_code: '1234' }
    });
    expect(setRes.statusCode).toBe(200);
    expect(setRes.json().status).toBe(true);

    const okRes = await app.inject({
      method: 'POST',
      url: '/check/company/pin',
      headers: { authorization: `Bearer ${token}` },
      payload: { pin_code: '1234' }
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().data.verified).toBe(true);

    const badRes = await app.inject({
      method: 'POST',
      url: '/check/company/pin',
      headers: { authorization: `Bearer ${token}` },
      payload: { pin_code: '9999' }
    });
    expect(badRes.statusCode).toBe(401);
    expect(badRes.json().error.code).toBe('invalid_pin');
  });
});

describe('GET /branches', () => {
  it('requires auth and lists company branches', async () => {
    const noAuth = await app.inject({ method: 'GET', url: '/branches' });
    expect(noAuth.statusCode).toBe(401);

    const res = await app.inject({ method: 'GET', url: '/branches', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Main');
  });
});

describe('POST /auth/logout', () => {
  it('revokes and returns success envelope', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe(true);
  });
});
