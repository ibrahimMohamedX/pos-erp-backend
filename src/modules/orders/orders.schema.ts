import { z } from 'zod';

export const addCustomerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  mobile: z.string().optional(),
  note: z.string().optional(),
  customerType: z.enum(['walk_in', 'regular', 'vip', 'delivery']).optional()
});

const modifierInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().optional(),
  price: z.coerce.number().optional(),
  quantity: z.coerce.number().int().positive().default(1),
  type: z.string().optional()
});

const itemInput = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().default(1),
  note: z.string().nullish(),
  modifiers: z.array(modifierInput).optional()
});

export const orderPayloadSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  order_id: z.coerce.number().int().positive().optional(),
  type: z.enum(['dine_in', 'takeaway', 'delivery', 'call_in']).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  customer: z
    .object({
      id: z.coerce.number().int().positive().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      mobile: z.string().optional(),
      note: z.string().optional(),
      customerType: z.enum(['walk_in', 'regular', 'vip', 'delivery']).optional()
    })
    .optional(),
  note: z.string().nullish(),
  idempotency_key: z.string().optional(),
  items: z.array(itemInput).min(1)
});

const orderStatusValues = ['open', 'hand_over', 'closed', 'cancelled'] as const;
export type OrderStatusValue = (typeof orderStatusValues)[number];

export const checkoutSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  order_id: z.coerce.number().int().positive().optional(),
  discount: z.coerce.number().min(0).optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'card', 'wallet', 'other']),
        amount: z.coerce.number().min(0)
      })
    )
    .optional()
});

export const orderStatusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(orderStatusValues),
  pin_code: z.string().optional()
});

export type AddCustomerInput = z.infer<typeof addCustomerSchema>;
export type OrderPayloadInput = z.infer<typeof orderPayloadSchema>;
export type OrderItemInput = z.infer<typeof itemInput>;
export type OrderModifierInput = z.infer<typeof modifierInput>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;
