import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import { num } from '../../common/serialize.js';

export async function getShiftControlDashboard(companyId: number) {
  const shifts = await prisma.shift.findMany({ where: { companyId }, orderBy: [{ openedAt: 'desc' }], take: 10 });
  const open = shifts.filter((s) => s.status === 'open').length;
  const totalSales = Number(shifts.reduce((s, o) => s + Number(o.expectedCash ?? 0), 0).toFixed(2));
  return {
    active_shifts: open,
    total_shifts: shifts.length,
    total_sales_expected: num(totalSales),
    shifts: shifts.map((s) => ({
      id: s.id,
      status: s.status,
      opened_at: s.openedAt.toISOString(),
      closed_at: s.closedAt?.toISOString() ?? null,
      expected_cash: num(s.expectedCash),
      actual_cash_count: num(s.actualCashCount),
      variance: num(s.variance)
    }))
  };
}

export async function closeShift(companyId: number, shiftId: number, input: { actual_cash_count?: number }) {
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, companyId } });
  if (!shift) throw AppError.notFound('shift_not_found', 'shift_not_found');
  if (shift.status === 'closed') throw AppError.conflict('shift_already_closed', 'shift_closed');
  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: { status: 'closed', closedAt: new Date(), actualCashCount: input.actual_cash_count ?? null }
  });
  return { id: updated.id, status: updated.status, actual_cash_count: num(updated.actualCashCount) };
}
