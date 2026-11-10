import type { FastifyInstance } from 'fastify';
import { prisma } from '../common/prisma.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
}
