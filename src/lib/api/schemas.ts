import { z } from "zod";

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM");

export const cardPatchSchema = z.object({
  limit: z.number().nonnegative().optional(),
  usedLimit: z.number().nonnegative().optional(),
  interestRateApr: z.number().min(0).max(1000).optional()
});

export const lineItemCreateSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.number().nonnegative()
});

export const lineItemPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  amount: z.number().nonnegative().optional()
});

export const purchaseCreateSchema = z.object({
  name: z.string().trim().min(1),
  price: z.number().nonnegative(),
  alias: z.string().trim().optional(),
  link: z.url().optional(),
  status: z.enum(["planned", "bought", "skipped"]).default("planned")
});

export const purchasePatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  price: z.number().nonnegative().optional(),
  alias: z.string().trim().optional(),
  link: z.url().optional(),
  status: z.enum(["planned", "bought", "skipped"]).optional()
});

export const monthlyPaymentsPutSchema = z.object({
  byCardId: z.record(z.string(), z.number().nonnegative()),
  formulaVariantId: z.string().min(1),
  formulaExpression: z.string().nullable().optional(),
  inferred: z.boolean().default(false)
});

export const adjustmentCategorySchema = z.enum(["income", "houseBills", "shopping", "myBills"]);

export const monthlyAdjustmentCreateSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.number().nonnegative(),
  category: adjustmentCategorySchema,
  startMonth: monthKeySchema,
  endMonth: monthKeySchema.optional()
});

export const monthlyAdjustmentPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  amount: z.number().nonnegative().optional(),
  category: adjustmentCategorySchema.optional(),
  startMonth: monthKeySchema.optional(),
  endMonth: monthKeySchema.nullable().optional()
});
