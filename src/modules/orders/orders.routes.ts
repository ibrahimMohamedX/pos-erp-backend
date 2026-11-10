import type { FastifyInstance } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import { addCustomerSchema, orderPayloadSchema, checkoutSchema, orderStatusSchema } from './orders.schema.js';
import * as orders from './orders.service.js';
import { parsePageLimit } from '../../common/serialize.js';

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

export async function orderRoutes(app: FastifyInstance) {
  app.post('/pos/add-customer', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(addCustomerSchema, request.body);
    const data = await orders.addCustomer(request.user.companyId, input);
    return reply.code(201).send(success(data, { message: 'customer_added' }));
  });

  app.post('/pos/send-to-kitchen', { onRequest: [app.authenticate] }, async (request, reply) => {
    const payload = parseBody(orderPayloadSchema, request.body);
    const headerKey = request.headers['idempotency-key'];
    const idempotencyKey = payload.idempotency_key ?? (typeof headerKey === 'string' ? headerKey : undefined);
    const data = await orders.createKitchenOrder(request.user.companyId, request.user.sub, payload, idempotencyKey);
    return reply.code(201).send(success(data, { message: 'order_sent_to_kitchen' }));
  });

  app.put('/pos/update-kitchen-order', { onRequest: [app.authenticate] }, async (request) => {
    const payload = parseBody(orderPayloadSchema, request.body);
    const orderId = payload.order_id ?? payload.id;
    if (!orderId) {
      throw AppError.badRequest('order_id_required', 'validation_error');
    }
    const data = await orders.updateKitchenOrder(request.user.companyId, orderId, payload);
    return success(data, { message: 'order_updated' });
  });

  app.post('/pos/checkout', { onRequest: [app.authenticate] }, async (request) => {
    const payload = parseBody(checkoutSchema, request.body);
    const orderId = payload.order_id ?? payload.id;
    if (!orderId) {
      throw AppError.badRequest('order_id_required', 'validation_error');
    }
    const data = await orders.checkoutOrder(request.user.companyId, orderId, payload);
    return success(data, { message: 'order_checkout' });
  });

  app.post('/pos/orders/status', { onRequest: [app.authenticate] }, async (request) => {
    const payload = parseBody(orderStatusSchema, request.body);
    const data = await orders.updateOrderStatus(request.user.companyId, payload);
    return success(data, { message: 'order_status_updated' });
  });

  app.get('/pos/orders', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const { skip, limit } = parsePageLimit(q);
    const data = await orders.listOrders(request.user.companyId, q, { skip, limit });
    return success(data.data, { totalCount: data.totalCount, meta: { page: Number(q.page ?? 1), limit } });
  });
}
