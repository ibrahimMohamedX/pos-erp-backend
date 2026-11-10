import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import { checkPinSchema, addPinSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

export async function pinRoutes(app: FastifyInstance) {
  app.post('/check/company/pin', { onRequest: [app.authenticate] }, async (request) => {
    const input = parseBody(checkPinSchema, request.body);
    const result = await authService.checkCompanyPin(request.user, input);
    return success(result, { message: 'pin_verified' });
  });

  app.post('/add/company/pin', { onRequest: [app.authenticate] }, async (request) => {
    const input = parseBody(addPinSchema, request.body);
    const result = await authService.addCompanyPin(request.user, input);
    return success(result, { message: 'pin_set' });
  });
}
