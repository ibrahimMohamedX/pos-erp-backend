import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import { money, num, parsePageLimit } from '../../common/serialize.js';
import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  cost_price: z.coerce.number().optional(),
  sale_price: z.coerce.number().optional(),
  current_stock: z.coerce.number().optional(),
  min_stock_level: z.coerce.number().optional(),
  max_stock_level: z.coerce.number().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  unit_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'discontinued']).optional()
});

export const adjustItemSchema = z.object({
  item_id: z.coerce.number().int().positive(),
  adjustment_type: z.enum(['increase', 'decrease', 'set']),
  quantity: z.coerce.number(),
  reason: z.string().optional(),
  reference_type: z.string().optional(),
  reference_id: z.coerce.number().int().positive().optional()
});

export const createPurchaseOrderSchema = z.object({
  supplier_id: z.coerce.number().int().positive().optional(),
  order_number: z.string().optional(),
  order_date: z.coerce.date().optional(),
  expected_date: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    item_id: z.coerce.number().int().positive(),
    quantity_ordered: z.coerce.number(),
    unit_cost: z.coerce.number()
  })).optional()
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type AdjustItemInput = z.infer<typeof adjustItemSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export function serializeItem(i: {
  id: number; name: string; sku: string | null; barcode: string | null;
  costPrice: unknown; salePrice: unknown; currentStock: unknown;
  minStockLevel: unknown; maxStockLevel: unknown; status: string;
  categoryId: number | null; supplierId: number | null; unitId: number | null;
  categoryName: string | null; supplierName: string | null; unitName: string | null;
  trackStock: boolean
}) {
  const stock = Number(i.currentStock ?? 0);
  const min = Number(i.minStockLevel ?? 0);
  return {
    id: i.id,
    name: i.name,
    sku: i.sku,
    barcode: i.barcode,
    cost_price: money(i.costPrice),
    sale_price: money(i.salePrice),
    current_stock: num(stock, 3),
    min_stock_level: num(min, 3),
    max_stock_level: i.maxStockLevel == null ? null : num(i.maxStockLevel, 3),
    status: i.status,
    category_id: i.categoryId,
    category_name: i.categoryName,
    supplier_id: i.supplierId,
    supplier_name: i.supplierName,
    unit_id: i.unitId,
    unit_name: i.unitName,
    track_stock: i.trackStock ? 1 : 0,
    is_low_stock: stock > 0 && stock <= min ? 1 : 0,
    is_out_of_stock: stock <= 0 ? 1 : 0
  };
}

export async function listItems(companyId: number, filters: Record<string, unknown>, opts: { skip: number; limit: number }) {
  const where: Record<string, unknown> = { companyId };
  if (filters.status) where.status = filters.status;
  if (filters.category_id) where.categoryId = Number(filters.category_id);
  if (filters.search) {
    where.OR = [{ name: { contains: String(filters.search), mode: 'insensitive' as const } }, { sku: { contains: String(filters.search) } }, { barcode: { contains: String(filters.search) } }];
  }
  const [rows, totalCount] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: { category: { select: { name: true } }, supplier: { select: { name: true } }, unit: { select: { name: true } } },
      orderBy: [{ id: 'desc' }],
      skip: opts.skip, take: opts.limit
    }),
    prisma.inventoryItem.count({ where })
  ]);
  return { data: rows.map((r) => serializeItem({ ...r, categoryName: r.category?.name ?? null, supplierName: r.supplier?.name ?? null, unitName: r.unit?.name ?? null })), totalCount };
}

export async function getDashboard(companyId: number) {
  const items = await prisma.inventoryItem.findMany({ where: { companyId } });
  const total = items.length;
  const available = items.filter((i) => Number(i.currentStock ?? 0) > 0).length;
  const lowStock = items.filter((i) => { const s = Number(i.currentStock ?? 0); const m = Number(i.minStockLevel ?? 0); return s > 0 && s <= m; }).length;
  const outOfStock = items.filter((i) => Number(i.currentStock ?? 0) <= 0).length;
  return {
    summary: { total, available, low_stock: lowStock, out_of_stock: outOfStock },
    alerts: {
      low_stock: { data: items.filter((i) => { const s = Number(i.currentStock ?? 0); const m = Number(i.minStockLevel ?? 0); return s > 0 && s <= m; }).map((i) => ({ id: i.id, name: i.name, current_stock: i.currentStock, min_stock_level: i.minStockLevel })) },
      out_of_stock: { data: items.filter((i) => Number(i.currentStock ?? 0) <= 0).map((i) => ({ id: i.id, name: i.name, current_stock: i.currentStock })) }
    }
  };
}

export async function createItem(companyId: number, input: CreateItemInput) {
  const row = await prisma.inventoryItem.create({
    data: {
      companyId,
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
      costPrice: input.cost_price,
      salePrice: input.sale_price,
      currentStock: input.current_stock ?? 0,
      minStockLevel: input.min_stock_level ?? 10,
      maxStockLevel: input.max_stock_level,
      status: input.status ?? 'active',
      trackStock: true
    }
  });
  return serializeItem({ ...row, categoryName: null, supplierName: null, unitName: null });
}

export async function deleteItem(companyId: number, itemId: number) {
  const existing = await prisma.inventoryItem.findFirst({ where: { id: itemId, companyId } });
  if (!existing) throw AppError.notFound('item_not_found', 'item_not_found');
  await prisma.inventoryItem.update({ where: { id: itemId }, data: { status: 'discontinued' } });
  return { deleted: true };
}

export async function adjustStock(companyId: number, input: AdjustItemInput) {
  const item = await prisma.inventoryItem.findFirst({ where: { id: input.item_id, companyId } });
  if (!item) throw AppError.notFound('item_not_found', 'item_not_found');
  const current = Number(item.currentStock ?? 0);
  let newStock: number;
  if (input.adjustment_type === 'increase') newStock = current + Number(input.quantity);
  else if (input.adjustment_type === 'decrease') newStock = Math.max(0, current - Number(input.quantity));
  else newStock = Number(input.quantity);
  const updated = await prisma.inventoryItem.update({
    where: { id: input.item_id },
    data: { currentStock: newStock }
  });
  await prisma.inventoryAdjustment.create({
    data: {
      companyId,
      itemId: input.item_id,
      adjustmentType: input.adjustment_type,
      quantity: Number(input.quantity),
      reason: input.reason,
      referenceType: input.reference_type,
      referenceId: input.reference_id,
      adjustedBy: undefined
    }
  });
  return serializeItem({ ...updated, categoryName: null, supplierName: null, unitName: null });
}

export async function listCategories(companyId: number) {
  const rows = await prisma.inventoryCategory.findMany({ where: { companyId }, orderBy: [{ id: 'asc' }] });
  return rows.map((r) => ({ id: r.id, name: r.name, name_ar: r.nameAr, is_active: r.isActive ? 1 : 0 }));
}

export async function createCategory(companyId: number, input: { name: string; name_ar?: string; is_active?: boolean }) {
  const row = await prisma.inventoryCategory.create({ data: { companyId, name: input.name, nameAr: input.name_ar, isActive: input.is_active ?? true } });
  return { id: row.id, name: row.name, name_ar: row.nameAr, is_active: row.isActive ? 1 : 0 };
}

export async function listSuppliers(companyId: number) {
  const rows = await prisma.supplier.findMany({ where: { companyId }, orderBy: [{ id: 'asc' }] });
  return rows.map((r) => ({ id: r.id, name: r.name, contact_person: r.contactPerson, phone: r.phone, email: r.email, address: r.address, is_active: r.isActive ? 1 : 0 }));
}

export async function listUnits(companyId: number) {
  const rows = await prisma.unit.findMany({ where: { companyId }, orderBy: [{ id: 'asc' }] });
  return rows.map((r) => ({ id: r.id, name: r.name, short_name: r.shortName, is_active: r.isActive ? 1 : 0 }));
}

export async function createPurchaseOrder(companyId: number, input: CreatePurchaseOrderInput) {
  const orderNumber = input.order_number ?? `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;
  const po = await prisma.purchaseOrder.create({
    data: {
      companyId,
      supplierId: input.supplier_id,
      orderNumber,
      orderDate: input.order_date ?? new Date(),
      expectedDate: input.expected_date,
      notes: input.notes,
      totalAmount: 0
    }
  });
  let total = 0;
  for (const it of input.items ?? []) {
    const itemCost = Number(it.unit_cost) * Number(it.quantity_ordered);
    total += itemCost;
    await prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId: po.id,
        itemId: it.item_id,
        quantityOrdered: Number(it.quantity_ordered),
        unitCost: Number(it.unit_cost),
        totalCost: itemCost
      }
    });
  }
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { totalAmount: total } });
  return { id: po.id, order_number: po.orderNumber, status: po.status, total_amount: num(total) };
}
