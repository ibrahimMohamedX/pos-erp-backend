import type { FastifyInstance } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { z } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import { parsePageLimit } from '../../common/serialize.js';
import * as inventory from './inventory.service.js';
import { createItemSchema, adjustItemSchema, createPurchaseOrderSchema } from './inventory.service.js';

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

function mergeInput(request: any): any {
  return { ...(request.query as any), ...(request.body as any) };
}

export async function inventoryRoutes(app: FastifyInstance) {
  app.get('/inventory/dashboard', { onRequest: [app.authenticate] }, async (request) => {
    const data = await inventory.getDashboard(request.user.companyId);
    return success(data, { message: 'inventory_dashboard' });
  });

  app.get('/inventory/items', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const { skip, limit } = parsePageLimit(q);
    const result = await inventory.listItems(request.user.companyId, q, { skip, limit });
    return success(result.data, { totalCount: result.totalCount, meta: { page: Number(q.page ?? 1), limit } });
  });

  app.post('/inventory/products', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(createItemSchema, mergeInput(request));
    const data = await inventory.createItem(request.user.companyId, input);
    return reply.code(201).send(success(data, { message: 'item_created' }));
  });

  app.delete('/inventory/items/:id', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await inventory.deleteItem(request.user.companyId, Number(id));
    return success(data, { message: 'item_deleted' });
  });

  app.post('/inventory/adjustment', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(adjustItemSchema, mergeInput(request));
    const data = await inventory.adjustStock(request.user.companyId, input);
    return reply.code(201).send(success(data, { message: 'stock_adjusted' }));
  });

  app.post('/inventory/purchase-orders', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(createPurchaseOrderSchema, mergeInput(request));
    const data = await inventory.createPurchaseOrder(request.user.companyId, input);
    return reply.code(201).send(success(data, { message: 'purchase_order_created' }));
  });

  app.get('/inventory/categories', { onRequest: [app.authenticate] }, async (request) => {
    const data = await inventory.listCategories(request.user.companyId);
    return success(data, { totalCount: data.length });
  });

  app.post('/inventory/categories', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(z.object({ name: z.string().min(1), name_ar: z.string().optional(), is_active: z.boolean().optional() }), request.body);
    const data = await inventory.createCategory(request.user.companyId, input);
    return reply.code(201).send(success(data, { message: 'category_created' }));
  });

  app.get('/inventory/suppliers', { onRequest: [app.authenticate] }, async (request) => {
    const data = await inventory.listSuppliers(request.user.companyId);
    return success(data, { totalCount: data.length });
  });

  app.get('/inventory/units', { onRequest: [app.authenticate] }, async (request) => {
    const data = await inventory.listUnits(request.user.companyId);
    return success(data, { totalCount: data.length });
  });
}
