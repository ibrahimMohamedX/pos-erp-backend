import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import fastifyMultipart from '@fastify/multipart';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import { parsePageLimit } from '../../common/serialize.js';
import { requireRole } from '../../plugins/auth.js';
import {
  createCategorySchema,
  createModifierGroupSchema,
  productFieldsSchema
} from './catalog.schema.js';
import * as catalog from './catalog.service.js';

const UPLOAD_DIR = path.resolve('uploads/products');
mkdirSync(UPLOAD_DIR, { recursive: true });

function parseJsonBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw AppError.badRequest('invalid_request_body', 'validation_error');
  return result.data;
}

async function readMultipartFields(request: FastifyRequest): Promise<{ fields: Record<string, unknown>; file?: { buffer: Buffer; filename: string; mimetype: string } }> {
  let fields: Record<string, unknown> = {};
  let file: { buffer: Buffer; filename: string; mimetype: string } | undefined;
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer();
      file = { buffer, filename: part.filename, mimetype: part.mimetype };
    } else {
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, file };
}

function saveProductImage(file: { buffer: Buffer; filename: string }): string {
  const ext = path.extname(file.filename) || '.png';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return `/uploads/products/${name}`;
}

function absoluteUrl(request: FastifyRequest, rel: string): string {
  return `${request.protocol}://${request.headers.host}${rel}`;
}

async function parseProductPayload(request: FastifyRequest) {
  const contentType = request.headers['content-type'] ?? '';
  if (contentType.includes('multipart/form-data')) {
    const { fields, file } = await readMultipartFields(request);
    const parsed = productFieldsSchema.safeParse(fields);
    if (!parsed.success) throw AppError.badRequest('invalid_request_body', 'validation_error');
    return { input: parsed.data, imageUrl: file ? absoluteUrl(request, saveProductImage(file)) : null };
  }
  const parsed = productFieldsSchema.safeParse(request.body ?? {});
  if (!parsed.success) throw AppError.badRequest('invalid_request_body', 'validation_error');
  return { input: parsed.data, imageUrl: null };
}

const ADMIN = ['owner', 'admin', 'manager'] as const;

export async function catalogRoutes(app: FastifyInstance) {
  await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  app.get('/pos/categories', { onRequest: [app.authenticate] }, async (request) => {
    const data = await catalog.listCategories(request.user.companyId, true);
    return success(data, { totalCount: data.length });
  });

  app.post('/pos/categories', { onRequest: [requireRole(...ADMIN)] }, async (request, reply) => {
    const input = parseJsonBody(createCategorySchema, request.body);
    const data = await catalog.createCategory(request.user.companyId, input);
    return reply.code(201).send(success(data, { message: 'category_created' }));
  });

  app.get('/pos/products/categories', { onRequest: [app.authenticate] }, async (request) => {
    const data = await catalog.listCategories(request.user.companyId, false);
    return success(data, { totalCount: data.length });
  });

  app.get('/pos/products/preparation-stations', { onRequest: [app.authenticate] }, async (request) => {
    const data = await catalog.listPrepStations(request.user.companyId);
    return success(data, { totalCount: data.length });
  });

  app.get('/pos/products/all', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const { skip, limit } = parsePageLimit(q);
    const result = await catalog.listProducts(request.user.companyId, {
      skip,
      limit,
      category_id: q.category_id ? Number(q.category_id) : undefined,
      search: q.search ? String(q.search) : undefined
    });
    return success(result.data, { totalCount: result.totalCount, meta: { page: Number(q.page ?? 1), limit } });
  });

  app.get('/pos/products/:id/modifiers', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await catalog.getProductModifiers(request.user.companyId, Number(id));
    return success(data, { totalCount: data.length });
  });

  app.post('/pos/products', { onRequest: [requireRole(...ADMIN)] }, async (request, reply) => {
    const { input, imageUrl } = await parseProductPayload(request);
    const data = await catalog.createProduct(request.user.companyId, input, imageUrl);
    return reply.code(201).send(success(data, { message: 'product_created' }));
  });

  app.post('/pos/products/:id', { onRequest: [requireRole(...ADMIN)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { input, imageUrl } = await parseProductPayload(request);
    const data = await catalog.updateProduct(request.user.companyId, Number(id), input, imageUrl);
    return success(data, { message: 'product_updated' });
  });

  app.delete('/pos/products/:id', { onRequest: [requireRole(...ADMIN)] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await catalog.deleteProduct(request.user.companyId, Number(id));
    return success(data, { message: 'product_deleted' });
  });

  app.patch('/pos/products/:id/toggle-active', { onRequest: [requireRole(...ADMIN)] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await catalog.toggleProductActive(request.user.companyId, Number(id));
    return success(data, { message: 'product_status_changed' });
  });

  app.get('/pos/modifier-groups', { onRequest: [requireRole(...ADMIN)] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const { skip, limit } = parsePageLimit(q);
    const result = await catalog.listModifierGroups(request.user.companyId, { skip, limit });
    return success(result.data, { totalCount: result.totalCount, meta: { page: Number(q.page ?? 1), limit } });
  });

  app.post('/pos/modifier-groups', { onRequest: [requireRole(...ADMIN)] }, async (request, reply) => {
    const input = parseJsonBody(createModifierGroupSchema, request.body);
    const data = await catalog.createModifierGroup(request.user.companyId, input);
    return reply.code(201).send(success(data, { message: 'modifier_group_created' }));
  });

  app.put('/pos/modifier-groups/:id', { onRequest: [requireRole(...ADMIN)] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseJsonBody(createModifierGroupSchema, request.body);
    const data = await catalog.updateModifierGroup(request.user.companyId, Number(id), input);
    return success(data, { message: 'modifier_group_updated' });
  });

  app.delete('/pos/modifier-groups/:id', { onRequest: [requireRole(...ADMIN)] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await catalog.deleteModifierGroup(request.user.companyId, Number(id));
    return success(data, { message: 'modifier_group_deleted' });
  });

  app.patch('/pos/modifier-groups/:id/toggle-active', { onRequest: [requireRole(...ADMIN)] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await catalog.toggleModifierGroupActive(request.user.companyId, Number(id));
    return success(data, { message: 'modifier_group_status_changed' });
  });
}
