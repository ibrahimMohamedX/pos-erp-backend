import type { FastifyInstance } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import { parsePageLimit } from '../../common/serialize.js';
import * as kds from './kds.service.js';
import { z } from 'zod';

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

const ticketActionSchema = z.object({
  action: z.enum(['start', 'ready', 'serve', 'pause', 'resume']),
  note: z.string().optional()
});

const bulkActionSchema = z.object({
  action: z.enum(['start', 'ready', 'serve', 'pause', 'resume']),
  ticket_ids: z.array(z.coerce.number().int().positive())
});

export async function kdsRoutes(app: FastifyInstance) {
  app.get('/kds/dashboard', { onRequest: [app.authenticate] }, async (request) => {
    const data = await kds.getKdsDashboard(request.user.companyId);
    return success(data, { message: 'kds_dashboard' });
  });

  app.get('/kds/tickets', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const { skip, limit } = parsePageLimit(q);
    const result = await kds.listKdsTickets(request.user.companyId, q, { skip, limit });
    return success(result.data, { totalCount: result.totalCount, meta: { page: Number(q.page ?? 1), limit } });
  });

  app.patch('/kds/tickets/:id/action', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parseBody(ticketActionSchema, request.body);
    const data = await kds.kdsTicketAction(request.user.companyId, Number(id), input.action, input.note);
    return reply.code(200).send(success(data, { message: 'ticket_action' }));
  });

  app.patch('/kds/tickets/bulk-action', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(bulkActionSchema, request.body);
    const data = await kds.kdsBulkAction(request.user.companyId, input.action, input.ticket_ids);
    return reply.code(200).send(success(data, { message: 'bulk_action' }));
  });
}
