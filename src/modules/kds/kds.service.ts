import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import { num } from '../../common/serialize.js';

const actionToStatus: Record<string, { status: string; field?: string }> = {
  start: { status: 'in_progress', field: 'startedAt' },
  ready: { status: 'ready', field: 'readyAt' },
  serve: { status: 'served', field: 'servedAt' },
  pause: { status: 'paused' },
  resume: { status: 'in_progress' }
};

export function serializeTicket(t: {
  id: number; companyId: number; orderId: number; stationId: number | null;
  status: string; priority: number; openedAt: Date; startedAt: Date | null;
  readyAt: Date | null; servedAt: Date | null; elapsedSeconds: number;
  preparationTargetSeconds: number | null; createdAt: Date; updatedAt: Date;
  items: { id: number; orderItemId: number | null; productId: number | null;
    lineNumber: number | null; quantity: unknown; name: string;
    modifiers: unknown; status: string; note: string | null }[]
}) {
  return {
    id: t.id,
    order_id: t.orderId,
    station_id: t.stationId,
    status: t.status,
    priority: t.priority,
    opened_at: t.openedAt.toISOString(),
    started_at: t.startedAt?.toISOString() ?? null,
    ready_at: t.readyAt?.toISOString() ?? null,
    served_at: t.servedAt?.toISOString() ?? null,
    elapsed_seconds: t.elapsedSeconds,
    preparation_target_seconds: t.preparationTargetSeconds,
    items: t.items.map((it) => ({
      id: it.id,
      order_item_id: it.orderItemId,
      product_id: it.productId,
      line_number: it.lineNumber,
      quantity: num(it.quantity, 3),
      name: it.name,
      modifiers: it.modifiers,
      status: it.status,
      note: it.note
    }))
  };
}

export async function getKdsDashboard(companyId: number) {
  const tickets = await prisma.kdsTicket.findMany({ where: { companyId } });
  const byStatus: Record<string, number> = {};
  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }
  const total = tickets.length;
  const elapsed = tickets.reduce((s, t) => s + t.elapsedSeconds, 0);
  return {
    total_tickets: total,
    by_status: byStatus,
    pending: byStatus['pending'] ?? 0,
    in_progress: byStatus['in_progress'] ?? 0,
    ready: byStatus['ready'] ?? 0,
    served: byStatus['served'] ?? 0,
    paused: byStatus['paused'] ?? 0,
    average_elapsed_seconds: total > 0 ? Math.round(elapsed / total) : 0
  };
}

export async function listKdsTickets(companyId: number, filters: Record<string, unknown>, opts: { skip: number; limit: number }) {
  const where: Record<string, unknown> = { companyId };
  if (filters.status) where.status = filters.status;
  if (filters.station_id) where.stationId = Number(filters.station_id);
  const [rows, totalCount] = await Promise.all([
    prisma.kdsTicket.findMany({
      where,
      include: { items: { orderBy: [{ id: 'asc' }] } },
      orderBy: [{ openedAt: 'desc' }],
      skip: opts.skip, take: opts.limit
    }),
    prisma.kdsTicket.count({ where })
  ]);
  return { data: rows.map(serializeTicket), totalCount };
}

export async function kdsTicketAction(companyId: number, ticketId: number, action: string, note?: string) {
  const mapping = actionToStatus[action];
  if (!mapping) throw AppError.badRequest('invalid_action', 'invalid_action');
  const ticket = await prisma.kdsTicket.findFirst({ where: { id: ticketId, companyId } });
  if (!ticket) throw AppError.notFound('ticket_not_found', 'ticket_not_found');
  const data: Record<string, unknown> = { status: mapping.status };
  if (mapping.field) data[mapping.field] = new Date();
  if (note) data['updatedAt'] = new Date();
  const updated = await prisma.kdsTicket.update({ where: { id: ticketId }, data });
  return serializeTicket({ ...updated, items: [] as any });
}

export async function kdsBulkAction(companyId: number, action: string, ticketIds: number[]) {
  const mapping = actionToStatus[action];
  if (!mapping) throw AppError.badRequest('invalid_action', 'invalid_action');
  const data: Record<string, unknown> = { status: mapping.status };
  if (mapping.field) data[mapping.field] = new Date();
  await prisma.kdsTicket.updateMany({ where: { id: { in: ticketIds }, companyId }, data });
  return { updated: ticketIds.length, action, status: mapping.status };
}
