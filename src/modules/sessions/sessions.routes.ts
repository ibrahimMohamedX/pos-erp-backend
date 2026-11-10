import type { FastifyInstance } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import * as sessions from './sessions.service.js';
import { z } from 'zod';

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

const openSessionSchema = z.object({
  opening_cash: z.coerce.number().min(0).optional(),
  branch_id: z.coerce.number().int().positive().optional()
});

const closeDaySchema = z.object({
  session_id: z.coerce.number().int().positive().optional(),
  opening_cash: z.coerce.number().min(0).optional()
});

export async function sessionRoutes(app: FastifyInstance) {
  app.get('/pos/sessions', { onRequest: [app.authenticate] }, async (request) => {
    const data = await sessions.listSessions(request.user.companyId, request.query as Record<string, unknown>);
    return success(data.data, { totalCount: data.data.length });
  });

  app.post('/pos/sessions', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(openSessionSchema, request.body);
    const data = await sessions.openSession(request.user.companyId, request.user.sub, input);
    return reply.code(201).send(success(data, { message: 'session_opened' }));
  });

  app.get('/pos/report/close-out', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const sessionId = q.session_id ? Number(q.session_id) : undefined;
    if (!sessionId) throw AppError.badRequest('session_id_required', 'validation_error');
    const data = await sessions.getSessionDetail(request.user.companyId, sessionId);
    return success(data, { message: 'session_detail' });
  });

  app.post('/pos/report/end-day', { onRequest: [app.authenticate] }, async (request) => {
    const input = parseBody(closeDaySchema, request.body);
    const sessionId = input.session_id;
    if (!sessionId) {
      throw AppError.badRequest('session_id_required', 'validation_error');
    }
    const data = await sessions.closeDay(request.user.companyId, sessionId, input);
    return success(data, { message: 'day_closed' });
  });
}
