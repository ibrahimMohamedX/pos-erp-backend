import type { FastifyInstance } from 'fastify';
import { prisma } from '../../common/prisma.js';
import { success } from '../../common/envelope.js';

export async function branchRoutes(app: FastifyInstance) {
  app.get('/branches', { onRequest: [app.authenticate] }, async (request) => {
    const branches = await prisma.branch.findMany({
      where: { companyId: request.user.companyId, isActive: true },
      orderBy: { id: 'asc' }
    });
    return success(branches, { totalCount: branches.length });
  });
}
