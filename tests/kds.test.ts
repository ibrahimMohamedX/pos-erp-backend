import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/common/prisma.js';

let app: FastifyInstance;
const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const email = `kds_${suffix}@test.local`;
const password = 'Passw0rd!';
let token = '';
let companyId = 0;
let ticketId = 0;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  const company = await prisma.company.create({ data: { name: `KDS Co ${suffix}` } });
  companyId = company.id;
  await prisma.user.create({
    data: {
      name: 'KDS User',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      companies: { create: { companyId: company.id, role: 'cashier', isDefault: true } }
    }
  });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  token = login.json().data.token;

  const category = await prisma.category.create({ data: { companyId, name: 'Food' } });
  const product = await prisma.product.create({
    data: { companyId, categoryId: category.id, name: 'Burger', salePrice: 50 }
  });
  const order = await prisma.order.create({
    data: {
      companyId,
      posDate: new Date(),
      status: 'open',
      type: 'dine_in',
      subtotal: 50,
      total: 50,
      items: { create: [{ productId: product.id, productName: 'Burger', quantity: 1, unitPrice: 50, totalPrice: 50, lineNumber: 1 }] }
    },
    include: { items: true }
  });
  const ticket = await prisma.kdsTicket.create({
    data: { companyId, orderId: order.id, status: 'pending', items: { create: [{ orderItemId: order.items[0].id, productId: product.id, quantity: 1, name: 'Burger' }] } }
  });
  ticketId = ticket.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
  await app.close();
});

const authH = () => ({ authorization: `Bearer ${token}` });

describe('GET /kds/dashboard', () => {
  it('returns KDS KPIs', async () => {
    const res = await app.inject({ method: 'GET', url: '/kds/dashboard', headers: authH() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.data.total_tickets).toBe(1);
    expect(body.data.pending).toBe(1);
  });
});

describe('GET /kds/tickets', () => {
  it('lists tickets with items', async () => {
    const res = await app.inject({ method: 'GET', url: '/kds/tickets', headers: authH() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(ticketId);
    expect(body.data[0].status).toBe('pending');
    expect(body.data[0].items).toHaveLength(1);
  });

  it('filters by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/kds/tickets?status=pending', headers: authH() });
    expect(res.json().data.length).toBe(1);
    const res2 = await app.inject({ method: 'GET', url: '/kds/tickets?status=served', headers: authH() });
    expect(res2.json().data.length).toBe(0);
  });
});

describe('PATCH /kds/tickets/:id/action', () => {
  it('starts a ticket', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/kds/tickets/${ticketId}/action`,
      headers: authH(),
      payload: { action: 'start' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('in_progress');
    expect(res.json().data.started_at).toBeDefined();
  });

  it('marks a ticket ready', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/kds/tickets/${ticketId}/action`,
      headers: authH(),
      payload: { action: 'ready' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('ready');
  });

  it('rejects invalid action', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/kds/tickets/${ticketId}/action`,
      headers: authH(),
      payload: { action: 'burn' as any }
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /kds/tickets/bulk-action', () => {
  it('applies bulk action', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/kds/tickets/bulk-action',
      headers: authH(),
      payload: { action: 'serve', ticket_ids: [ticketId] }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.updated).toBe(1);
    expect(res.json().data.status).toBe('served');
  });
});
