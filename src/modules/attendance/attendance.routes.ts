import type { FastifyInstance } from 'fastify';
import * as attendance from './attendance.service.js';
import { success } from '../../common/envelope.js';

export async function attendanceRoutes(app: FastifyInstance) {
  app.get('/attendance/status', { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, unknown>;
    const userId = q.user_id ? Number(q.user_id) : request.user.sub;
    const data = await attendance.getAttendanceStatus(request.user.companyId, userId, q.date as string | undefined);
    return success(data, { message: 'attendance_status' });
  });

  app.post('/attendance/clock-in', { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const userId = q.user_id ? Number(q.user_id) : request.user.sub;
    const data = await attendance.clockIn(request.user.companyId, userId);
    return reply.code(201).send(success(data, { message: 'clocked_in' }));
  });

  app.post('/attendance/clock-out', { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const userId = q.user_id ? Number(q.user_id) : request.user.sub;
    const data = await attendance.clockOut(request.user.companyId, userId);
    return reply.code(200).send(success(data, { message: 'clocked_out' }));
  });
}
