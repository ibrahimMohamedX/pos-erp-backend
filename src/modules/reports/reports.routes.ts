import type { FastifyInstance } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import { parsePageLimit } from '../../common/serialize.js';
import * as reports from './reports.service.js';
import { z } from 'zod';

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports/pos-dashboard', { onRequest: [app.authenticate] }, async (request) => {
    const data = await reports.getPosDashboard(request.user.companyId);
    return success(data, { message: 'pos_dashboard' });
  });

  app.get('/pos/salesReport', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const data = await reports.getSalesReport(request.user.companyId, q);
    return success(data, { message: 'sales_report' });
  });

  app.get('/reports/z-report/pdf', { onRequest: [app.authenticate] }, async (request, reply) => {
    const pdf = reports.makePdf('Z-Report');
    return reply.code(200).type('application/pdf').send(pdf);
  });

  app.get('/reports/z-report/print', { onRequest: [app.authenticate] }, async (request, reply) => {
    const pdf = reports.makePdf('Z-Print');
    return reply.code(200).type('application/pdf').send(pdf);
  });

  app.get('/close-out-day', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const data = await reports.getSalesReport(request.user.companyId, q);
    return success(data, { message: 'close_out_day' });
  });

  app.post('/close-out-day/end-day', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseBody(z.object({ opening_cash: z.coerce.number().min(0).optional() }), request.body);
    return success({ status: 'closed', opening_cash: input.opening_cash }, { message: 'end_day' });
  });
}
