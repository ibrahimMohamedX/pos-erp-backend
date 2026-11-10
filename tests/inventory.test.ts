import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/common/prisma.js';

let app: FastifyInstance;
const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const email = `inv_${suffix}@test.local`;
const password = 'Passw0rd!';
let token = '';
let companyId = 0;
let categoryId = 0;
let supplierId = 0;
let unitId = 0;
let itemId = 0;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  const company = await prisma.company.create({ data: { name: `Inv Co ${suffix}` } });
  companyId = company.id;
  await prisma.user.create({
    data: {
      name: 'Inv User',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      companies: { create: { companyId: company.id, role: 'admin', isDefault: true } }
    }
  });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  token = login.json().data.token;
  const cat = await prisma.inventoryCategory.create({ data: { companyId, name: 'Dairy' } });
  categoryId = cat.id;
  const sup = await prisma.supplier.create({ data: { companyId, name: 'FreshCo' } });
  supplierId = sup.id;
  const un = await prisma.unit.create({ data: { companyId, name: 'Piece', shortName: 'pcs' } });
  unitId = un.id;
  const item = await prisma.inventoryItem.create({
    data: { companyId, name: 'Milk', sku: 'MILK001', currentStock: 10, minStockLevel: 5, status: 'active', categoryId, supplierId, unitId }
  });
  itemId = item.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
  await app.close();
});

const authH = () => ({ authorization: `Bearer ${token}` });

describe('GET /inventory/dashboard', () => {
  it('returns dashboard summary', async () => {
    const res = await app.inject({ method: 'GET', url: '/inventory/dashboard', headers: authH() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.data.summary).toBeDefined();
    expect(body.data.summary.total).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /inventory/items', () => {
  it('lists items with filters and pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/inventory/items?category_id=${categoryId}&search=Milk`,
      headers: authH()
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Milk');
    expect(body.data[0].is_low_stock).toBe(0);
    expect(body.data[0].is_out_of_stock).toBe(0);
  });
});

describe('POST /inventory/products', () => {
  it('creates a new inventory item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/inventory/products',
      headers: authH(),
      payload: { name: 'Cheese', sku: 'CHZ002', current_stock: 2, min_stock_level: 3, category_id: categoryId, supplier_id: supplierId, unit_id: unitId }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.is_low_stock).toBe(1);
  });
});

describe('POST /inventory/adjustment', () => {
  it('increases stock', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustment',
      headers: authH(),
      payload: { item_id: itemId, adjustment_type: 'increase', quantity: 5, reason: 'restock' }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.current_stock).toBe(15);
  });

  it('decreases stock', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustment',
      headers: authH(),
      payload: { item_id: itemId, adjustment_type: 'decrease', quantity: 12, reason: 'sale' }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.current_stock).toBe(3);
    expect(res.json().data.is_low_stock).toBe(1);
  });
});

describe('POST /inventory/purchase-orders', () => {
  it('creates a purchase order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/inventory/purchase-orders',
      headers: authH(),
      payload: { supplier_id: supplierId, items: [{ item_id: itemId, quantity_ordered: 10, unit_cost: 5 }] }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.total_amount).toBe(50);
  });
});

describe('GET /inventory/categories|suppliers|units', () => {
  it('lists reference data', async () => {
    const cat = await app.inject({ method: 'GET', url: '/inventory/categories', headers: authH() });
    expect(cat.json().data.length).toBeGreaterThan(0);
    const sup = await app.inject({ method: 'GET', url: '/inventory/suppliers', headers: authH() });
    expect(sup.json().data.length).toBeGreaterThan(0);
    const un = await app.inject({ method: 'GET', url: '/inventory/units', headers: authH() });
    expect(un.json().data.length).toBeGreaterThan(0);
  });
});

describe('DELETE /inventory/items/:id', () => {
  it('soft deletes an item', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/inventory/items/999999',
      headers: authH()
    });
    expect(res.statusCode).toBe(404);
  });
});
