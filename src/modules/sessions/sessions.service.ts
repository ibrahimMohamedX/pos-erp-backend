import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import { num } from '../../common/serialize.js';

export async function listSessions(companyId: number, filters: Record<string, unknown>) {
  const where: Record<string, unknown> = { companyId };
  if (filters.status) where.status = filters.status;
  const rows: any[] = await prisma.posSession.findMany({
    where,
    include: { cashier: { select: { id: true, name: true } } },
    orderBy: [{ openedAt: 'desc' }]
  });
  return {
    data: rows.map((s) => ({
      id: s.id,
      cashier_id: s.cashierId,
      cashier_name: s.cashier.name,
      branch_id: s.branchId,
      opening_cash: num(s.openingCash),
      opened_at: s.openedAt.toISOString(),
      closed_at: s.closedAt?.toISOString() ?? null,
      status: s.status,
      shift_code: s.shiftCode
    }))
  };
}

export async function openSession(companyId: number, userId: number, input: { opening_cash?: number; branchId?: number }) {
  const session = await prisma.posSession.create({
    data: {
      companyId,
      cashierId: userId,
      branchId: input.branchId ?? null,
      openingCash: input.opening_cash ?? 0,
      status: 'open'
    }
  });
  await prisma.cashDrawer.create({
    data: { sessionId: session.id, openingCash: input.opening_cash ?? 0 }
  });
  return {
    id: session.id,
    opening_cash: num(session.openingCash),
    opened_at: session.openedAt.toISOString(),
    status: session.status
  };
}

export async function getSessionDetail(companyId: number, sessionId: number) {
  const session = await prisma.posSession.findFirst({
    where: { id: sessionId, companyId },
    include: {
      cashier: { select: { id: true, name: true } },
      orders: { orderBy: [{ createdAt: 'desc' }] },
      cashDrawer: true,
      sessionCashiers: { include: { cashier: { select: { id: true, name: true } } } }
    }
  });
  if (!session) throw AppError.notFound('session_not_found', 'session_not_found');

  const orders = session.orders;
  const subtotal = Number(orders.reduce((s, o) => s + Number(o.subtotal ?? 0), 0).toFixed(2));
  const totalDiscount = Number(orders.reduce((s, o) => s + Number(o.totalDiscount ?? 0), 0).toFixed(2));
  const totalTax = Number(orders.reduce((s, o) => s + Number(o.totalTax ?? 0), 0).toFixed(2));
  const total = Number(orders.reduce((s, o) => s + Number(o.total ?? 0), 0).toFixed(2));

  const paymentBreakdown: Record<string, { count: number; sales: number }> = {};
  for (const o of orders) {
    const pay = (o as any).payment;
    if (!pay?.method) continue;
    for (const m of pay.method) {
      if (!paymentBreakdown[m.method]) paymentBreakdown[m.method] = { count: 0, sales: 0 };
      paymentBreakdown[m.method].count += 1;
      paymentBreakdown[m.method].sales += Number(m.amount ?? 0);
    }
  }
  const payment_details = Object.entries(paymentBreakdown).map(([method, v]) => ({ payment_type: method, count: v.count, sales: num(v.sales) }));

  const cd = session.cashDrawer!;
  return {
    session: { id: session.id, opened_at: session.openedAt.toISOString(), closed_at: session.closedAt?.toISOString() ?? null },
    cashiers: session.sessionCashiers.map((sc) => ({ id: sc.cashierId, name: sc.cashier.name })),
    summary: {
      totalOrders: orders.length,
      subTotal: num(subtotal),
      discount: num(totalDiscount),
      netSales: num(total - totalDiscount),
      taxAmount: num(totalTax),
      total: num(total)
    },
    payment_details,
    cash_drawer: {
      opening_cash: num(cd.openingCash),
      cash_payment: num(cd.cashPayment),
      cash_refund: num(cd.cashRefund),
      cash_in: num(cd.cashIn),
      cash_out: num(cd.cashOut),
      drawer_total: num(cd.drawerTotal)
    },
    print_url: `/pos/sessions/${sessionId}/receipt`
  };
}

export async function closeDay(companyId: number, sessionId: number, input: { opening_cash?: number }) {
  const session = await prisma.posSession.findFirst({ where: { id: sessionId, companyId } });
  if (!session) throw AppError.notFound('session_not_found', 'session_not_found');
  if (session.status === 'closed') throw AppError.conflict('session_already_closed', 'session_closed');

  const orders = await prisma.order.findMany({ where: { sessionId, companyId } });
  const subtotal = Number(orders.reduce((s, o) => s + Number(o.subtotal ?? 0), 0).toFixed(2));
  const totalDiscount = Number(orders.reduce((s, o) => s + Number(o.totalDiscount ?? 0), 0).toFixed(2));
  const totalTax = Number(orders.reduce((s, o) => s + Number(o.totalTax ?? 0), 0).toFixed(2));
  const total = Number(orders.reduce((s, o) => s + Number(o.total ?? 0), 0).toFixed(2));

  const updated = await prisma.posSession.update({
    where: { id: sessionId },
    data: { status: 'closed', closedAt: new Date() }
  });
  if (input.opening_cash != null) {
    await prisma.cashDrawer.update({ where: { sessionId }, data: { openingCash: input.opening_cash } });
  }

  return {
    session_id: sessionId,
    status: 'closed',
    closed_at: updated.closedAt?.toISOString() ?? null,
    summary: {
      totalOrders: orders.length,
      subTotal: num(subtotal),
      discount: num(totalDiscount),
      netSales: num(total - totalDiscount),
      taxAmount: num(totalTax),
      total: num(total)
    }
  };
}
