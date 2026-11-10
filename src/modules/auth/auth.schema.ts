import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const checkPinSchema = z.object({
  pin_code: z.string().min(1)
});

export const addPinSchema = z.object({
  pin_code: z.string().min(4).max(10)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CheckPinInput = z.infer<typeof checkPinSchema>;
export type AddPinInput = z.infer<typeof addPinSchema>;
