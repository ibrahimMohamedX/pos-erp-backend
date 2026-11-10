import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import { money, num } from '../../common/serialize.js';
import type { ModifierType, Prisma } from '@prisma/client';
import type { AddCustomerInput, CheckoutInput, OrderPayloadInput, OrderStatusInput } from './orders.schema.js';

function modifierType(value: string | undefined): ModifierType {
  return value === 'Addon' ? 'Addon' : 'Prep';
}

type OrderWithItems = NonNullable<Awaited<ReturnType<typeof fetchOrder>>>;

function fetchOrder(orderId: number, companyId: number) {
  return prisma.order.findFirst({
    where: { id: orderId, companyId },
    include: {
      items: { orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }], include: { modifiers: true } }
    }
  });
}

export function serializeOrder(o: OrderWithItems) {
  return {
    id: o.id,
    pos_date: o.posDate instanceof Date ? o.posDate.toISOString().slice(0, 10) : String(o.posDate),
    created_at: o.createdAt.toISOString(),
    status: o.status,
    type: o.type,
    customer_id: o.customerId,
    customer_name: o.customerName,
    customer_mobile: o.customerMobile,
    session_id: o.sessionId,
    subtotal: num(o.subtotal),
    total_tax: num(o.totalTax),
    total_discount: num(o.totalDiscount),
    total: num(o.total),
    version: o.version,
    idempotency_key: o.idempotencyKey,
    payment: o.payment,
    print_receipt_url: o.printReceiptUrl,
    print_kitchen_url: o.printKitchenUrl,
    kashier_print_url: o.kashierPrintUrl,
    items: o.items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      product_name: item.productName,
      quantity: num(item.quantity, 3),
      price: money(item.unitPrice),
      total_price: money(item.totalPrice),
      note: item.note,
      status: item.status,
      modifier_items: item.modifiers.map((m) => ({
        id: m.modifierItemId,
        name: m.modifierName,
        price: money(m.modifierPrice),
        quantity: m.quantity,
        type: m.type
      }))
    }))
  };
}

export async function addCustomer(companyId: number, input: AddCustomerInput) {
  const row = await prisma.customer.create({
    data: {
      companyId,
      firstName: input.first_name,
      lastName: input.last_name,
      mobile: input.mobile,
      notes: input.note,
      customerType: input.customerType ?? 'walk_in'
    }
  });
  return {
    id: row.id,
    first_name: row.firstName,
    last_name: row.lastName,
    mobile: row.mobile,
    note: row.notes,
    customer_type: row.customerType
  };
}

function today(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function resolveCustomerId(companyId: number, payload: OrderPayloadInput): Promise<number | null> {
  if (payload.customer_id) {
    const c = await prisma.customer.findFirst({ where: { id: payload.customer_id, companyId }, select: { id: true } });
    if (!c) throw AppError.notFound('customer_not_found', 'customer_not_found');
    return c.id;
  }
  const c = payload.customer;
  if (!c) return null;
  if (c.id) {
    const existing = await prisma.customer.findFirst({ where: { id: c.id, companyId }, select: { id: true } });
    if (!existing) throw AppError.notFound('customer_not_found', 'customer_not_found');
    return existing.id;
  }
  if (!c.first_name) return null;
  const created = await prisma.customer.create({
    data: {
      companyId,
      firstName: c.first_name,
      lastName: c.last_name,
      mobile: c.mobile,
      customerType: c.customerType ?? 'walk_in'
    }
  });
  return created.id;
}

interface PreparedItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note: string | null;
  modifiers: { modifierItemId: number | null; modifierName: string; modifierPrice: number; quantity: number; type: ModifierType }[];
}

async function prepareItems(companyId: number, payload: OrderPayloadInput): Promise<PreparedItem[]> {
  const productIds = [...new Set(payload.items.map((i) => i.product_id))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, companyId },
    select: { id: true, name: true, salePrice: true, isActive: true }
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const modifierIds = payload.items.flatMap((i) => (i.modifiers ?? []).filter((m) => m.id).map((m) => m.id!));
  const modifierItems = modifierIds.length
    ? await prisma.modifierItem.findMany({
        where: { id: { in: modifierIds }, modifierGroup: { companyId } },
        select: { id: true, name: true, price: true, type: true }
      })
    : [];
  const modifierById = new Map(modifierItems.map((m) => [m.id, m]));

  return payload.items.map((item) => {
    const product = byId.get(item.product_id);
    if (!product) throw AppError.notFound(`product_${item.product_id}_not_found`, 'product_not_found');
    if (!product.isActive) throw AppError.badRequest(`product_${item.product_id}_inactive`, 'product_inactive');

    const unitPrice = Number(product.salePrice);
    const modifiers = (item.modifiers ?? []).map((m) => {
      const dbItem = m.id ? modifierById.get(m.id) : undefined;
      return {
        modifierItemId: dbItem?.id ?? null,
        modifierName: dbItem?.name ?? m.name ?? '',
        modifierPrice: dbItem ? Number(dbItem.price) : m.price ?? 0,
        quantity: m.quantity,
        type: modifierType(dbItem?.type ?? m.type)
      };
    });
    const modifiersTotal = modifiers.reduce((sum, m) => sum + m.modifierPrice * m.quantity, 0);
    return {
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: Number((unitPrice * item.quantity + modifiersTotal).toFixed(2)),
      note: item.note ?? null,
      modifiers
    };
  });
}

function orderTotals(items: PreparedItem[]) {
  const subtotal = Number(items.reduce((s, i) => s + i.totalPrice, 0).toFixed(2));
  return { subtotal, totalTax: 0, totalDiscount: 0, total: subtotal };
}

export async function createKitchenOrder(
  companyId: number,
  userId: number,
  payload: OrderPayloadInput,
  idempotencyKey: string | undefined
) {
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey },
      include: { items: { orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }], include: { modifiers: true } } }
    });
    if (existing && existing.companyId === companyId) return serializeOrder(existing);
  }

  const items = await prepareItems(companyId, payload);
  const customerId = await resolveCustomerId(companyId, payload);
  const totals = orderTotals(items);

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        companyId,
        posDate: today(),
        type: payload.type ?? 'dine_in',
        customerId,
        idempotencyKey: idempotencyKey ?? null,
        createdBy: userId,
        ...totals,
        items: {
          create: items.map((item, index) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            note: item.note,
            lineNumber: index + 1,
            modifiers: {
              create: item.modifiers.map((m) => ({
                modifierItemId: m.modifierItemId,
                modifierName: m.modifierName,
                modifierPrice: m.modifierPrice,
                quantity: m.quantity,
                type: m.type
              }))
            }
          }))
        }
      },
      include: { items: true }
    });

    await tx.kdsTicket.create({
      data: {
        companyId,
        orderId: order.id,
        items: {
          create: order.items.map((item) => ({
            orderItemId: item.id,
            productId: item.productId,
            lineNumber: item.lineNumber,
            quantity: item.quantity,
            name: item.productName,
            note: item.note,
            modifiers: payload.items[item.lineNumber! - 1]?.modifiers?.length
              ? payload.items[item.lineNumber! - 1].modifiers!.map((m) => String(m.name ?? m.id ?? ''))
              : undefined
          }))
        }
      }
    });

    return order;
  });

  const full = (await fetchOrder(created.id, companyId))!;
  return serializeOrder(full);
}

export async function updateKitchenOrder(companyId: number, orderId: number, payload: OrderPayloadInput) {
  const existing = await prisma.order.findFirst({ where: { id: orderId, companyId }, select: { id: true, status: true, version: true } });
  if (!existing) throw AppError.notFound('order_not_found', 'order_not_found');
  if (existing.status !== 'open') throw AppError.conflict('order_not_editable', 'order_not_editable');

  const items = await prepareItems(companyId, payload);
  const customerId = await resolveCustomerId(companyId, payload);
  const totals = orderTotals(items);

  const updated = await prisma.$transaction(async (tx) => {
    const oldItems = await tx.orderItem.findMany({ where: { orderId }, select: { id: true } });
    const oldItemIds = oldItems.map((i) => i.id);
    await tx.kdsTicketItem.deleteMany({ where: { orderItemId: { in: oldItemIds } } });
    await tx.orderItemModifier.deleteMany({ where: { orderItemId: { in: oldItemIds } } });
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.kdsTicket.deleteMany({ where: { orderId } });

    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        type: payload.type ?? undefined,
        customerId: payload.customer_id || payload.customer ? customerId : undefined,
        version: { increment: 1 },
        ...totals,
        items: {
          create: items.map((item, index) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            note: item.note,
            lineNumber: index + 1,
            modifiers: {
              create: item.modifiers.map((m) => ({
                modifierItemId: m.modifierItemId,
                modifierName: m.modifierName,
                modifierPrice: m.modifierPrice,
                quantity: m.quantity,
                type: m.type
              }))
            }
          }))
        }
      },
      include: { items: true }
    });

    await tx.kdsTicket.create({
      data: {
        companyId,
        orderId: order.id,
        items: {
          create: order.items.map((item) => ({
            orderItemId: item.id,
            productId: item.productId,
            lineNumber: item.lineNumber,
            quantity: item.quantity,
            name: item.productName,
            note: item.note
          }))
        }
      }
    });

    return order;
  });

  const full = (await fetchOrder(updated.id, companyId))!;
  return serializeOrder(full);
}

export async function checkoutOrder(companyId: number, orderId: number, input: CheckoutInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId } });
  if (!order) throw AppError.notFound('order_not_found', 'order_not_found');
  if (order.status === 'closed') throw AppError.conflict('order_already_closed', 'order_closed');

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { taxRate: true } });
  const taxRate = Number(company?.taxRate ?? 0);
  const subtotal = Number(order.subtotal);
  const discount = Math.max(0, input.discount ?? 0);
  const taxable = Math.max(0, subtotal - discount);
  const totalTax = Number((taxable * (taxRate / 100)).toFixed(2));
  const total = Number((taxable + totalTax).toFixed(2));

  const paymentSummary = {
    method: input.payments?.map((p) => ({ method: p.method, amount: Number(p.amount.toFixed(2)) })) ?? [],
    payment_total: Number(input.payments?.reduce((s: number, p) => s + Number(p.amount), 0).toFixed(2) ?? 0),
    discount,
    total_tax: totalTax
  };

  const updated = await prisma.order.update({
    where: { id: orderId },
      data: {
        totalDiscount: discount,
        totalTax: totalTax,
        total,
        payment: paymentSummary,
        status: 'hand_over'
      }
  });

  return serializeOrder({ ...updated, items: [] } as unknown as OrderWithItems);
}

export async function updateOrderStatus(companyId: number, input: OrderStatusInput) {
  const order = await prisma.order.findFirst({ where: { id: input.id, companyId } });
  if (!order) throw AppError.notFound('order_not_found', 'order_not_found');

  if (input.status === 'cancelled' && input.pin_code) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { pinCode: true } });
    if (!company?.pinCode || company.pinCode !== input.pin_code) {
      throw AppError.unauthorized('invalid_pin', 'invalid_pin');
    }
  }

  const updated = await prisma.order.update({
    where: { id: input.id },
    data: {
      status: input.status,
      ...(input.status === 'closed' || input.status === 'cancelled' ? { closedAt: new Date() } : {})
    }
  });
  return { id: updated.id, status: updated.status };
}

export async function listOrders(companyId: number, filters: Record<string, unknown>, opts: { skip: number; limit: number }) {
  const where: Prisma.OrderWhereInput = { companyId };
  if (filters.status) where.status = filters.status;
  if (filters.date_from || filters.date_to) {
    where.posDate = {};
    if (filters.date_from) where.posDate.gte = new Date(String(filters.date_from));
    if (filters.date_to) where.posDate.lte = new Date(String(filters.date_to));
  }
  if (filters.session_id) where.sessionId = Number(filters.session_id);
  if (filters.search) {
    where.OR = [{ customerName: { contains: String(filters.search), mode: 'insensitive' as const } }, { warehouseName: { contains: String(filters.search) } }];
  }

  const [rows, totalCount] = await Promise.all([
    prisma.order.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip: opts.skip, take: opts.limit }),
    prisma.order.count({ where })
  ]);
  const fullOrders = await Promise.all(rows.map((o) => fetchOrder(o.id, companyId)));
  return { data: fullOrders.map((o) => o ? serializeOrder(o) : null), totalCount };
}
