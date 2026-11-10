import type { FastifyInstance } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import * as shifts from './shifts.service.js';
import { z } from 'zod';

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

const closeShiftSchema = z.object({
  actual_cash_count: z.coerce.number().min(0).optional()
});

export async function shiftRoutes(app: FastifyInstance) {
  app.get('/shifts/control/dashboard', { onRequest: [app.authenticate] }, async (request) => {
    const data = await shifts.getShiftControlDashboard(request.user.companyId);
    return success(data, { message: 'shift_dashboard' });
  });

  app.post('/shifts/close', { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const shiftId = q.shift_id ? Number(q.shift_id) : undefined;
    if (!shiftId) throw AppError.badRequest('shift_id_required', 'validation_error');
    const input = parseBody(closeShiftSchema, request.body);
    const data = await shifts.closeShift(request.user.companyId, shiftId, input);
    return reply.code(200).send(success(data, { message: 'shift_closed' }));
  });
}
