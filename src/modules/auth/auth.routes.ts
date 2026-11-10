import type { FastifyInstance } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { success } from '../../common/envelope.js';
import { AppError } from '../../common/errors.js';
import { loginSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest('invalid_request_body', 'validation_error');
  }
  return result.data;
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const input = parseBody(loginSchema, request.body);
    const result = await authService.login(input);
    const token = app.jwt.sign(result.payload);
    return reply.code(200).send(
      success(
        { user: result.user, token, refresh_token: result.refreshToken },
        { message: 'login_successful' }
      )
    );
  });

  app.post('/logout', { onRequest: [app.authenticate] }, async (request) => {
    const result = await authService.logout(request.user);
    return success(result, { message: 'logout_successful' });
  });
}
