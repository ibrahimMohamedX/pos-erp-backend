import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import { money } from '../../common/serialize.js';
import type { CreateCategoryInput, CreateModifierGroupInput, ProductFieldsInput } from './catalog.schema.js';

export function serializeCategory(c: {
  id: number;
  name: string;
  nameAr: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}) {
  return {
    id: c.id,
    name: c.name,
    name_ar: c.nameAr,
    image_url: c.imageUrl,
    sort_order: c.sortOrder,
    is_active: c.isActive ? 1 : 0
  };
}

export function serializeModifierItem(i: {
  id: number;
  name: string;
  nameAr: string | null;
  price: unknown;
  type: string;
  isActive: boolean;
  sortOrder: number;
}) {
  return {
    id: i.id,
    name: i.name,
    name_ar: i.nameAr,
    price: money(i.price),
    type: i.type,
    is_active: i.isActive ? 1 : 0,
    sort_order: i.sortOrder
  };
}

export function serializeModifierGroup(g: {
  id: number;
  name: string;
  nameAr: string | null;
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  isActive: boolean;
  sortOrder: number;
  items: Parameters<typeof serializeModifierItem>[0][];
}) {
  return {
    id: g.id,
    name: g.name,
    name_ar: g.nameAr,
    is_required: g.isRequired ? 1 : 0,
    min_selection: g.minSelection,
    max_selection: g.maxSelection,
    is_active: g.isActive ? 1 : 0,
    sort_order: g.sortOrder,
    items: g.items.map(serializeModifierItem)
  };
}

export function serializeProduct(
  p: {
    id: number;
    name: string;
    nameAr: string | null;
    description: string | null;
    categoryId: number | null;
    subCategoryId: number | null;
    sku: string | null;
    barcode: string | null;
    salePrice: unknown;
    costPrice: unknown;
    proImageUrl: string | null;
    isStock: boolean;
    stockQuantity: unknown;
    lowStockThreshold: unknown;
    isActive: boolean;
    preparationStationId: number | null;
  },
  adds: { id: number; name: string; price: unknown; type: string }[] = []
) {
  return {
    id: p.id,
    name: p.name,
    name_ar: p.nameAr,
    description: p.description,
    category_id: p.categoryId,
    sub_category_id: p.subCategoryId,
    sku: p.sku,
    barcode: p.barcode,
    sale_price: money(p.salePrice),
    cost_price: p.costPrice == null ? null : money(p.costPrice),
    pro_image_url: p.proImageUrl,
    is_stock: p.isStock ? 1 : 0,
    stock_quantity: Number(p.stockQuantity ?? 0),
    low_stock_threshold: Number(p.lowStockThreshold ?? 0),
    is_active: p.isActive ? 1 : 0,
    preparation_station_id: p.preparationStationId,
    adds
  };
}

const productInclude = {
  modifierLinks: {
    include: {
      modifierGroup: { include: { items: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] } } }
    }
  }
};

type ProductWithLinks = Awaited<ReturnType<typeof prisma.product.findFirstOrThrow<{ include: typeof productInclude }>>>;

function productAdds(p: ProductWithLinks) {
  const adds: { id: number; name: string; price: unknown; type: string }[] = [];
  for (const link of p.modifierLinks) {
    for (const item of link.modifierGroup.items) {
      adds.push({ id: item.id, name: item.name, price: item.price, type: item.type });
    }
  }
  return adds;
}

export async function listCategories(companyId: number, onlyActive: boolean) {
  const rows = await prisma.category.findMany({
    where: { companyId, ...(onlyActive ? { isActive: true } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
  });
  return rows.map(serializeCategory);
}

export async function createCategory(companyId: number, input: CreateCategoryInput) {
  const row = await prisma.category.create({
    data: {
      companyId,
      name: input.name,
      nameAr: input.name_ar,
      sortOrder: input.sort_order ?? 0,
      isActive: input.is_active ?? true
    }
  });
  return serializeCategory(row);
}

export async function listProducts(companyId: number, opts: { skip: number; limit: number; category_id?: number; search?: string }) {
  const where = {
    companyId,
    ...(opts.category_id ? { OR: [{ categoryId: opts.category_id }, { subCategoryId: opts.category_id }] } : {}),
    ...(opts.search ? { OR: [{ name: { contains: opts.search, mode: 'insensitive' as const } }, { nameAr: { contains: opts.search } }, { sku: { contains: opts.search } }] } : {})
  };
  const [rows, totalCount] = await Promise.all([
    prisma.product.findMany({ where, include: productInclude, orderBy: [{ id: 'desc' }], skip: opts.skip, take: opts.limit }),
    prisma.product.count({ where })
  ]);
  return { data: rows.map((p) => serializeProduct(p, productAdds(p))), totalCount };
}

export async function getProductModifiers(companyId: number, productId: number) {
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    include: productInclude
  });
  if (!product) throw AppError.notFound('product_not_found', 'product_not_found');
  return product.modifierLinks
    .map((l) => l.modifierGroup)
    .filter((g) => g.isActive)
    .map((g) => serializeModifierGroup({ ...g, items: g.items }));
}

export async function listPrepStations(companyId: number) {
  const rows = await prisma.kdsStation.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }]
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    name_ar: s.nameAr,
    display_order: s.displayOrder,
    is_active: s.isActive ? 1 : 0
  }));
}

function commonProductData(input: ProductFieldsInput) {
  return {
    name: input.name,
    nameAr: input.name_ar,
    description: input.description,
    categoryId: input.category_id,
    subCategoryId: input.sub_category_id,
    sku: input.sku || null,
    barcode: input.barcode,
    salePrice: input.sale_price,
    costPrice: input.cost_price,
    isStock: input.is_stock ?? true,
    stockQuantity: input.stock_quantity ?? 0,
    lowStockThreshold: input.low_stock_threshold ?? 10,
    isActive: input.is_active ?? true,
    preparationStationId: input.preparation_station_id
  };
}

export async function createProduct(companyId: number, input: ProductFieldsInput, imageUrl: string | null) {
  const row = await prisma.product.create({
    data: {
      ...commonProductData(input),
      companyId,
      proImageUrl: imageUrl,
      modifierLinks: input.modifier_group_ids
        ? { create: input.modifier_group_ids.map((gid) => ({ modifierGroupId: gid })) }
        : undefined
    },
    include: productInclude
  });
  return serializeProduct(row, productAdds(row));
}

export async function updateProduct(companyId: number, productId: number, input: ProductFieldsInput, imageUrl: string | null) {
  const existing = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!existing) throw AppError.notFound('product_not_found', 'product_not_found');
  const row = await prisma.product.update({
    where: { id: productId },
    data: {
      ...commonProductData(input),
      ...(imageUrl ? { proImageUrl: imageUrl } : {}),
      ...(input.modifier_group_ids
        ? {
            modifierLinks: {
              deleteMany: {},
              create: input.modifier_group_ids.map((gid) => ({ modifierGroupId: gid }))
            }
          }
        : {})
    },
    include: productInclude
  });
  return serializeProduct(row, productAdds(row));
}

export async function deleteProduct(companyId: number, productId: number) {
  const existing = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!existing) throw AppError.notFound('product_not_found', 'product_not_found');
  await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
  return { deleted: true };
}

export async function toggleProductActive(companyId: number, productId: number) {
  const existing = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!existing) throw AppError.notFound('product_not_found', 'product_not_found');
  const row = await prisma.product.update({
    where: { id: productId },
    data: { isActive: !existing.isActive }
  });
  return { id: row.id, is_active: row.isActive ? 1 : 0 };
}

const groupInclude = {
  items: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] }
};

export async function listModifierGroups(companyId: number, opts: { skip: number; limit: number }) {
  const [rows, totalCount] = await Promise.all([
    prisma.modifierGroup.findMany({ where: { companyId }, include: groupInclude, orderBy: [{ id: 'desc' }], skip: opts.skip, take: opts.limit }),
    prisma.modifierGroup.count({ where: { companyId } })
  ]);
  return { data: rows.map((g) => serializeModifierGroup(g)), totalCount };
}

export async function createModifierGroup(companyId: number, input: CreateModifierGroupInput) {
  const row = await prisma.modifierGroup.create({
    data: {
      companyId,
      name: input.name,
      nameAr: input.name_ar,
      isRequired: input.is_required ?? false,
      minSelection: input.min_selection ?? 0,
      maxSelection: input.max_selection ?? 1,
      sortOrder: input.sort_order ?? 0,
      isActive: input.is_active ?? true,
      items: input.items
        ? {
            create: input.items.map((i) => ({
              name: i.name,
              nameAr: i.name_ar,
              price: i.price ?? 0,
              type: i.type ?? 'Prep',
              sortOrder: i.sort_order ?? 0,
              isActive: i.is_active ?? true
            }))
          }
        : undefined
    },
    include: groupInclude
  });
  return serializeModifierGroup(row);
}

export async function updateModifierGroup(companyId: number, groupId: number, input: CreateModifierGroupInput) {
  const existing = await prisma.modifierGroup.findFirst({ where: { id: groupId, companyId } });
  if (!existing) throw AppError.notFound('modifier_group_not_found', 'modifier_group_not_found');
  const row = await prisma.modifierGroup.update({
    where: { id: groupId },
    data: {
      name: input.name,
      nameAr: input.name_ar,
      isRequired: input.is_required ?? existing.isRequired,
      minSelection: input.min_selection ?? existing.minSelection,
      maxSelection: input.max_selection ?? existing.maxSelection,
      sortOrder: input.sort_order ?? existing.sortOrder,
      isActive: input.is_active ?? existing.isActive,
      ...(input.items
        ? {
            items: {
              deleteMany: {},
              create: input.items.map((i) => ({
                name: i.name,
                nameAr: i.name_ar,
                price: i.price ?? 0,
                type: i.type ?? 'Prep',
                sortOrder: i.sort_order ?? 0,
                isActive: i.is_active ?? true
              }))
            }
          }
        : {})
    },
    include: groupInclude
  });
  return serializeModifierGroup(row);
}

export async function deleteModifierGroup(companyId: number, groupId: number) {
  const existing = await prisma.modifierGroup.findFirst({ where: { id: groupId, companyId } });
  if (!existing) throw AppError.notFound('modifier_group_not_found', 'modifier_group_not_found');
  await prisma.modifierGroup.update({ where: { id: groupId }, data: { isActive: false } });
  return { deleted: true };
}

export async function toggleModifierGroupActive(companyId: number, groupId: number) {
  const existing = await prisma.modifierGroup.findFirst({ where: { id: groupId, companyId } });
  if (!existing) throw AppError.notFound('modifier_group_not_found', 'modifier_group_not_found');
  const row = await prisma.modifierGroup.update({
    where: { id: groupId },
    data: { isActive: !existing.isActive }
  });
  return { id: row.id, is_active: row.isActive ? 1 : 0 };
}
