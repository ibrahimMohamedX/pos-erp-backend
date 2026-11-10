import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/common/prisma.js';

let app: FastifyInstance;
const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const email = `rep_${suffix}@test.local`;
const password = 'Passw0rd!';
let token = '';
let companyId = 0;
let userId = 0;
let orderId = 0;
let shiftId = 0;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  const company = await prisma.company.create({ data: { name: `Rep Co ${suffix}`, taxRate: 14 } });
  companyId = company.id;
  const user = await prisma.user.create({
    data: {
      name: 'Rep User',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      companies: { create: { companyId: company.id, role: 'cashier', isDefault: true } }
    }
  });
  userId = user.id;
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  token = login.json().data.token;

  const category = await prisma.category.create({ data: { companyId, name: 'Food' } });
  const product = await prisma.product.create({ data: { companyId, categoryId: category.id, name: 'Burger', salePrice: 50 } });
  const order = await prisma.order.create({
    data: {
      companyId, posDate: new Date(), status: 'closed', type: 'dine_in', createdBy: userId,
      subtotal: 100, totalTax: 14, total: 114,
      payment: { method: [{ method: 'cash', amount: 114 }] },
      items: { create: [{ productId: product.id, productName: 'Burger', quantity: 2, unitPrice: 50, totalPrice: 100, lineNumber: 1 }] }
    }
  });
  orderId = order.id;

  const shift = await prisma.shift.create({
    data: { companyId, cashierId: userId, openingCash: 200, status: 'open', expectedCash: 500 }
  });
  shiftId = shift.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
  await app.close();
});

const authH = () => ({ authorization: `Bearer ${token}` });

describe('GET /reports/pos-dashboard', () => {
  it('returns dashboard KPIs', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/pos-dashboard', headers: authH() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.data.total_sales).toBe(114);
    expect(body.data.total_orders).toBe(1);
    expect(body.data.cash_sales).toBe(114);
  });
});

describe('GET /pos/salesReport', () => {
  it('returns sales report', async () => {
    const res = await app.inject({ method: 'GET', url: '/pos/salesReport', headers: authH() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.data.total_sales).toBe(114);
    expect(body.data.total_tax).toBe(14);
    expect(body.data.orders).toHaveLength(1);
  });
});

describe('PDF endpoints', () => {
  it('z-report pdf', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/z-report/pdf', headers: authH() });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const body = res.body as string;
    expect(body.startsWith('%PDF-')).toBe(true);
  });

  it('z-report print', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/z-report/print', headers: authH() });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /close-out-day', () => {
  it('returns close-out day report', async () => {
    const res = await app.inject({ method: 'GET', url: '/close-out-day', headers: authH() });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe(true);
  });
});

describe('POST /close-out-day/end-day', () => {
  it('ends day', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/close-out-day/end-day',
      headers: authH(),
      payload: { opening_cash: 300 }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('closed');
  });
});

describe('GET /shifts/control/dashboard', () => {
  it('returns shift dashboard', async () => {
    const res = await app.inject({ method: 'GET', url: '/shifts/control/dashboard', headers: authH() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.data.active_shifts).toBe(1);
  });
});

describe('POST /shifts/close', () => {
  it('closes shift', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/shifts/close?shift_id=${shiftId}`,
      headers: authH(),
      payload: { actual_cash_count: 520 }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('closed');
    expect(res.json().data.actual_cash_count).toBe(520);
  });

  it('requires shift_id', async () => {
    const res = await app.inject({ method: 'POST', url: '/shifts/close', headers: authH(), payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe('Attendance', () => {
  it('status, clock-in, clock-out', async () => {
    const status = await app.inject({ method: 'GET', url: '/attendance/status', headers: authH() });
    expect(status.statusCode).toBe(200);
    expect(status.json().data.is_clocked_in).toBe(false);

    const ci = await app.inject({ method: 'POST', url: '/attendance/clock-in', headers: authH() });
    expect(ci.statusCode).toBe(201);
    expect(ci.json().data.is_clocked_in).toBe(true);

    const co = await app.inject({ method: 'POST', url: '/attendance/clock-out', headers: authH() });
    expect(co.statusCode).toBe(200);
    expect(co.json().data.is_clocked_in).toBe(false);
    expect(co.json().data.total_work_time).toBeGreaterThanOrEqual(0);
  });
});
