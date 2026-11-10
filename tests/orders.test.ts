import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/common/prisma.js';

let app: FastifyInstance;
const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const email = `orders_${suffix}@test.local`;
const password = 'Passw0rd!';
let token = '';
let companyId = 0;
let productId = 0;
let secondProductId = 0;
let modifierItemId = 0;
let customerId = 0;
let orderId = 0;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  const company = await prisma.company.create({ data: { name: `Orders Co ${suffix}`, taxRate: 14 } });
  companyId = company.id;
  await prisma.user.create({
    data: {
      name: 'Orders User',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      companies: { create: { companyId: company.id, role: 'admin', isDefault: true } }
    }
  });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  token = login.json().data.token;

  const category = await prisma.category.create({ data: { companyId, name: 'Food' } });
  const group = await prisma.modifierGroup.create({ data: { companyId, name: 'Extras' } });
  const item = await prisma.modifierItem.create({
    data: { modifierGroupId: group.id, name: 'Cheese', price: 2, type: 'Prep' }
  });
  modifierItemId = item.id;
  const product = await prisma.product.create({
    data: {
      companyId,
      categoryId: category.id,
      name: 'Burger',
      salePrice: 50,
      modifierLinks: { create: { modifierGroupId: group.id } }
    }
  });
  productId = product.id;
  const second = await prisma.product.create({
    data: { companyId, categoryId: category.id, name: 'Fries', salePrice: 20 }
  });
  secondProductId = second.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await app.close();
});

const authH = () => ({ authorization: `Bearer ${token}` });

describe('POST /pos/add-customer', () => {
  it('creates a customer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/add-customer',
      headers: authH(),
      payload: { first_name: 'John', last_name: 'Doe', mobile: '01000000000', customerType: 'regular' }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    customerId = body.data.id;
    expect(body.data.first_name).toBe('John');
    expect(body.data.customer_type).toBe('regular');
  });
});

describe('POST /pos/send-to-kitchen', () => {
  it('creates order with items, modifiers and kds ticket', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/send-to-kitchen',
      headers: { ...authH(), 'idempotency-key': `idem-${suffix}` },
      payload: {
        type: 'dine_in',
        customer_id: customerId,
        items: [
          {
            product_id: productId,
            quantity: 2,
            modifiers: [{ id: modifierItemId, quantity: 1 }]
          },
          { product_id: secondProductId, quantity: 1 }
        ]
      }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    orderId = body.data.id;
    expect(body.data.status).toBe('open');
    expect(body.data.subtotal).toBe(122);
    expect(body.data.total).toBe(122);
    expect(body.data.items[0].product_name).toBe('Burger');
    expect(body.data.items[0].modifier_items[0].name).toBe('Cheese');
    expect(body.data.items[0].modifier_items[0].price).toBe('2.00');

    const tickets = await prisma.kdsTicket.count({ where: { orderId } });
    expect(tickets).toBe(1);
  });

  it('is idempotent on retry with same key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/send-to-kitchen',
      headers: { ...authH(), 'idempotency-key': `idem-${suffix}` },
      payload: {
        type: 'dine_in',
        customer_id: customerId,
        items: [{ product_id: productId, quantity: 2, modifiers: [{ id: modifierItemId, quantity: 1 }] }]
      }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe(orderId);
    const count = await prisma.order.count({ where: { companyId } });
    expect(count).toBe(1);
  });

  it('rejects unknown product with 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/send-to-kitchen',
      headers: authH(),
      payload: { items: [{ product_id: 999999, quantity: 1 }] }
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects empty items with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/send-to-kitchen',
      headers: authH(),
      payload: { items: [] }
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /pos/update-kitchen-order', () => {
  it('replaces items and bumps version', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/pos/update-kitchen-order',
      headers: authH(),
      payload: {
        order_id: orderId,
        type: 'takeaway',
        items: [{ product_id: secondProductId, quantity: 3 }]
      }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.type).toBe('takeaway');
    expect(body.data.version).toBe(2);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.subtotal).toBe(60);
    const tickets = await prisma.kdsTicket.count({ where: { orderId } });
    expect(tickets).toBe(1);
  });

  it('rejects update without order_id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/pos/update-kitchen-order',
      headers: authH(),
      payload: { items: [{ product_id: productId, quantity: 1 }] }
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('checkout and order status', () => {
  it('computes tax and total on checkout', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/checkout',
      headers: authH(),
      payload: { order_id: orderId, discount: 10, payments: [{ method: 'cash', amount: 150 }] }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.subtotal).toBe(60); // Fries x3 after update-kitchen-order
    expect(body.data.total_tax).toBe(7); // (60-10) * 14%
    expect(body.data.total).toBe(57);
    expect(body.data.status).toBe('hand_over');
    expect(Array.isArray(body.data.payment.method)).toBe(true);
  });

  it('updates order status to closed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/orders/status',
      headers: authH(),
      payload: { id: orderId, status: 'closed' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('closed');
  });

  it('rejects checkout on closed order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/checkout',
      headers: authH(),
      payload: { order_id: orderId, payments: [] }
    });
    expect(res.statusCode).toBe(409);
  });

  it('lists orders with status filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/pos/orders', headers: authH() });
    expect(res.statusCode).toBe(200);
    const all = res.json();
    expect(all.data.length).toBeGreaterThan(0);
    const filtered = await app.inject({ method: 'GET', url: '/pos/orders?status=closed', headers: authH() });
    expect(filtered.json().data).toHaveLength(1);
  });

  it('cancel requires correct company PIN', async () => {
    // create a fresh order to cancel
    const fresh = await app.inject({
      method: 'POST',
      url: '/pos/send-to-kitchen',
      headers: { ...authH(), 'idempotency-key': `idem-cancel-${suffix}` },
      payload: { items: [{ product_id: productId, quantity: 1 }] }
    });
    const freshId = fresh.json().data.id;

    await app.inject({
      method: 'POST',
      url: '/add/company/pin',
      headers: authH(),
      payload: { pin_code: '7777' }
    });

    const wrongPin = await app.inject({
      method: 'POST',
      url: '/pos/orders/status',
      headers: authH(),
      payload: { id: freshId, status: 'cancelled', pin_code: '0000' }
    });
    expect(wrongPin.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST',
      url: '/pos/orders/status',
      headers: authH(),
      payload: { id: freshId, status: 'cancelled', pin_code: '7777' }
    });
    expect(ok.statusCode).toBe(200);
  });
});
