import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { env } from './config/env.js';
import { AppError } from './common/errors.js';
import { failure } from './common/envelope.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { pinRoutes } from './modules/auth/pin.routes.js';
import { branchRoutes } from './modules/branches/branches.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { orderRoutes } from './modules/orders/orders.routes.js';
import { sessionRoutes } from './modules/sessions/sessions.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { kdsRoutes } from './modules/kds/kds.routes.js';
import { reportRoutes } from './modules/reports/reports.routes.js';
import { shiftRoutes } from './modules/shifts/shifts.routes.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isProd
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
    trustProxy: true
  });

  await app.register(cors, { origin: true });
  await app.register(fastifyStatic, { root: path.resolve('uploads'), prefix: '/uploads/' });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(failure(`Route ${request.method}:${request.url} not found`, 'not_found'));
  });

  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send(failure(err.message, err.code));
    }
    if (err.validation) {
      const first = err.validation[0];
      const message = first ? `${first.instancePath} ${first.message ?? 'invalid'}`.trim() : 'validation_error';
      return reply.code(400).send(failure(message, 'validation_error'));
    }
    request.log.error(err);
    const statusCode = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    return reply.code(statusCode).send(failure(err.message || 'internal_error', 'internal_error'));
  });

  await app.register(authPlugin);
  await app.register(healthRoutes, { prefix: '/' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(pinRoutes, { prefix: '/' });
  await app.register(branchRoutes, { prefix: '/' });
  await app.register(catalogRoutes, { prefix: '/' });
  await app.register(orderRoutes, { prefix: '/' });
  await app.register(sessionRoutes, { prefix: '/' });
  await app.register(inventoryRoutes, { prefix: '/' });
  await app.register(kdsRoutes, { prefix: '/' });
  await app.register(reportRoutes, { prefix: '/' });
  await app.register(shiftRoutes, { prefix: '/' });
  await app.register(attendanceRoutes, { prefix: '/' });

  return app;
}
