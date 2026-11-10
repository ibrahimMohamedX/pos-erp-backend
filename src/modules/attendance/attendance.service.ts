import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import { num } from '../../common/serialize.js';

export async function getAttendanceStatus(companyId: number, userId?: number, date?: string) {
  const d = date ? new Date(date) : new Date();
  d.setUTCHours(0, 0, 0, 0);
  const where: Record<string, unknown> = { companyId, date: d };
  if (userId) where.userId = userId;
  const record = await prisma.attendanceRecord.findFirst({ where });
  return {
    date: d.toISOString().slice(0, 10),
    is_clocked_in: !!record?.isClockedIn,
    clock_in_time: record?.clockInTime?.toISOString() ?? null,
    clock_out_time: record?.clockOutTime?.toISOString() ?? null,
    total_work_time: record?.totalSeconds ?? 0,
    work_progress_percentage: num((record?.workProgressPercent as any)?.toNumber?.() ?? 0)
  };
}

export async function clockIn(companyId: number, userId: number) {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  const existing = await prisma.attendanceRecord.findFirst({ where: { userId, companyId, date: d } });
  if (existing) {
    const updated = await prisma.attendanceRecord.update({ where: { id: existing.id }, data: { clockInTime: new Date(), isClockedIn: true } });
    return { id: updated.id, clock_in_time: updated.clockInTime!.toISOString(), is_clocked_in: true };
  }
  const record = await prisma.attendanceRecord.create({
    data: { userId, companyId, date: d, clockInTime: new Date(), isClockedIn: true }
  });
  return { id: record.id, clock_in_time: record.clockInTime!.toISOString(), is_clocked_in: true };
}

export async function clockOut(companyId: number, userId: number) {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  const record = await prisma.attendanceRecord.findFirst({ where: { userId, companyId, date: d } });
  if (!record || !record.clockInTime) throw AppError.badRequest('not_clocked_in', 'not_clocked_in');
  const now = new Date();
  const totalSeconds = Math.floor((now.getTime() - record.clockInTime.getTime()) / 1000);
  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { clockOutTime: now, isClockedIn: false, totalSeconds: totalSeconds }
  });
  return { id: updated.id, clock_out_time: updated.clockOutTime!.toISOString(), total_work_time: totalSeconds, is_clocked_in: false };
}
