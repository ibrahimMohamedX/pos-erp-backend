import { z } from 'zod';

const optionalId = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null(), z.undefined()])
  .transform((v): number | undefined => (typeof v === 'number' ? v : undefined));

const optionalDecimal = z
  .union([z.coerce.number(), z.literal(''), z.null(), z.undefined()])
  .transform((v): number | undefined => (typeof v === 'number' ? v : undefined));

const optionalBool = z
  .union([z.enum(['0', '1', 'true', 'false']), z.boolean(), z.literal(''), z.undefined()])
  .transform((v): boolean | undefined => {
    if (v === true || v === '1' || v === 'true') return true;
    if (v === false || v === '0' || v === 'false') return false;
    return undefined;
  });

export const createCategorySchema = z.object({
  name: z.string().min(1),
  name_ar: z.string().optional(),
  sort_order: optionalDecimal,
  is_active: optionalBool
});

export const modifierItemSchema = z.object({
  name: z.string().min(1),
  name_ar: z.string().optional(),
  price: optionalDecimal,
  type: z.enum(['Prep', 'Addon']).optional(),
  sort_order: optionalDecimal,
  is_active: optionalBool
});

export const createModifierGroupSchema = z.object({
  name: z.string().min(1),
  name_ar: z.string().optional(),
  is_required: optionalBool,
  min_selection: optionalDecimal,
  max_selection: optionalDecimal,
  sort_order: optionalDecimal,
  is_active: optionalBool,
  items: z.array(modifierItemSchema).optional()
});

export const productFieldsSchema = z.object({
  name: z.string().min(1),
  name_ar: z.string().optional(),
  description: z.string().optional(),
  category_id: optionalId,
  sub_category_id: optionalId,
  sku: z.string().optional(),
  barcode: z.string().optional(),
  sale_price: z.coerce.number(),
  cost_price: optionalDecimal,
  is_stock: optionalBool,
  stock_quantity: optionalDecimal,
  low_stock_threshold: optionalDecimal,
  preparation_station_id: optionalId,
  is_active: optionalBool,
  modifier_group_ids: z
    .union([z.array(z.coerce.number().int().positive()), z.string()])
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      if (typeof v === 'string') {
        return v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      }
      return v;
    })
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;
export type ProductFieldsInput = z.infer<typeof productFieldsSchema>;
