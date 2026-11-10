import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/common/prisma.js';

let app: FastifyInstance;
const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const adminEmail = `admin_${suffix}@test.local`;
const cashierEmail = `cashier_${suffix}@test.local`;
const password = 'Passw0rd!';
let token = '';
let cashierToken = '';
let companyId = 0;
let categoryId = 0;
let groupId = 0;
let productId = 0;

function multipartBody(fields: Record<string, string>, file?: { name: string; filename: string; type: string; data: Buffer }) {
  const boundary = `----test${Date.now()}`;
  let head = '';
  for (const [k, v] of Object.entries(fields)) {
    head += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  let payload: Buffer;
  if (file) {
    const fileHead = `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`;
    payload = Buffer.concat([
      Buffer.from(head + fileHead, 'binary'),
      file.data,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
  } else {
    payload = Buffer.from(`${head}--${boundary}--\r\n`);
  }
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  const company = await prisma.company.create({ data: { name: `Catalog Co ${suffix}` } });
  companyId = company.id;
  for (const [email, role] of [
    [adminEmail, 'admin'],
    [cashierEmail, 'cashier']
  ] as const) {
    await prisma.user.create({
      data: {
        name: email.split('@')[0],
        email,
        passwordHash: await bcrypt.hash(password, 10),
        companies: { create: { companyId: company.id, role, isDefault: true } }
      }
    });
  }
  const login = async (email: string) => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    return res.json().data.token as string;
  };
  token = await login(adminEmail);
  cashierToken = await login(cashierEmail);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, cashierEmail] } } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await app.close();
});

describe('categories', () => {
  it('admin creates a category', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Burgers', name_ar: 'برجر' }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe(true);
    categoryId = body.data.id;
  });

  it('cashier cannot create a category', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/categories',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { name: 'X' }
    });
    expect(res.statusCode).toBe(403);
  });

  it('lists active categories for POS', async () => {
    const res = await app.inject({ method: 'GET', url: '/pos/categories', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Burgers');
    expect(body.data[0].is_active).toBe(1);
  });
});

describe('modifier groups', () => {
  it('creates group with items and lists it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pos/modifier-groups',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Extras',
        is_required: true,
        min_selection: 1,
        max_selection: 3,
        items: [
          { name: 'Cheese', price: 2, type: 'Prep' },
          { name: 'Bacon', price: 3.5, type: 'Addon' }
        ]
      }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    groupId = body.data.id;
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].price).toBe('2.00');

    const list = await app.inject({
      method: 'GET',
      url: '/pos/modifier-groups',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(list.json().totalCount).toBe(1);
  });

  it('updates group and toggles it', async () => {
    const upd = await app.inject({
      method: 'PUT',
      url: `/pos/modifier-groups/${groupId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Extras v2', max_selection: 5 }
    });
    expect(upd.json().data.name).toBe('Extras v2');
    expect(upd.json().data.max_selection).toBe(5);

    const tog = await app.inject({
      method: 'PATCH',
      url: `/pos/modifier-groups/${groupId}/toggle-active`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(tog.json().data.is_active).toBe(0);
    await app.inject({
      method: 'PATCH',
      url: `/pos/modifier-groups/${groupId}/toggle-active`,
      headers: { authorization: `Bearer ${token}` }
    });
  });
});

describe('products', () => {
  it('creates product via multipart with image and modifiers', async () => {
    const { payload, headers } = multipartBody(
      {
        name: 'Big Burger',
        sale_price: '25.5',
        category_id: String(categoryId),
        is_stock: '1',
        stock_quantity: '10',
        modifier_group_ids: String(groupId)
      },
      { name: 'image', filename: 'burger.png', type: 'image/png', data: Buffer.from('pngdata') }
    );
    const res = await app.inject({
      method: 'POST',
      url: '/pos/products',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    productId = body.data.id;
    expect(body.data.sale_price).toBe('25.50');
    expect(body.data.pro_image_url).toContain('/uploads/products/');
    expect(body.data.adds).toHaveLength(2);
    expect(body.data.adds[0].name).toBe('Cheese');
  });

  it('lists products with search and category filter', async () => {
    const all = await app.inject({ method: 'GET', url: '/pos/products/all', headers: { authorization: `Bearer ${token}` } });
    expect(all.json().totalCount).toBe(1);
    const filtered = await app.inject({
      method: 'GET',
      url: `/pos/products/all?category_id=${categoryId}&search=big`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(filtered.json().data).toHaveLength(1);
    const miss = await app.inject({
      method: 'GET',
      url: '/pos/products/all?search=nonexistent',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(miss.json().data).toHaveLength(0);
  });

  it('returns product modifiers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/pos/products/${productId}/modifiers`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].name).toBe('Extras v2');
  });

  it('updates product via JSON and toggles active', async () => {
    const upd = await app.inject({
      method: 'POST',
      url: `/pos/products/${productId}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'Mega Burger', sale_price: 30, category_id: categoryId }
    });
    expect(upd.json().data.name).toBe('Mega Burger');
    expect(upd.json().data.sale_price).toBe('30.00');

    const tog = await app.inject({
      method: 'PATCH',
      url: `/pos/products/${productId}/toggle-active`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(tog.json().data.is_active).toBe(0);
  });

  it('soft deletes product and preparation stations list', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: `/pos/products/${productId}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(del.json().data.deleted).toBe(true);

    const stations = await app.inject({
      method: 'GET',
      url: '/pos/products/preparation-stations',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(stations.json().data).toHaveLength(0);
  });
});
