import { z } from "zod";

const minimumPaymentRuleSchema = z.object({
  type: z.enum(["fixed", "percent"]),
  value: z.number().positive()
});

const lateFeeRuleSchema = z.object({
  type: z.literal("fixed"),
  value: z.number().nonnegative()
});

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM");

export const cardPatchSchema = z.object({
  limit: z.number().nonnegative().optional(),
  usedLimit: z.number().nonnegative().optional(),
  interestRateApr: z.number().min(0).max(1000).optional(),
  dueDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  statementDay: z.number().int().min(1).max(31).nullable().optional(),
  minimumPaymentRule: minimumPaymentRuleSchema.nullable().optional(),
  interestFreeDays: z.number().int().min(0).max(120).nullable().optional(),
  lateFeeRule: lateFeeRuleSchema.nullable().optional()
});

export const webPushSubscriptionSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

export const pushSubscriptionUpsertSchema = z.object({
  subscription: webPushSubscriptionSchema,
  userAgent: z.string().trim().optional()
});

export const pushSubscriptionDeleteSchema = z.object({
  endpoint: z.url()
});

export const pushSubscriptionRepairSchema = z.object({
  endpoint: z.url().optional()
});

export const lineItemCreateSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.number().nonnegative(),
  dueDayOfMonth: z.number().int().min(1).max(31).nullable().optional()
});

export const lineItemPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  amount: z.number().nonnegative().optional(),
  dueDayOfMonth: z.number().int().min(1).max(31).nullable().optional()
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

export const monthlyIncomePaydaysPutSchema = z.object({
  byIncomeId: z.record(
    z.string(),
    z
      .array(z.number().int().min(1).max(31))
      .min(1)
      .nullable()
  )
});

export const adjustmentCategorySchema = z.enum(["income", "houseBills", "shopping", "myBills"]);
export const incomeSourceTypeSchema = z.enum(["loan", "bonus", "other"]);

export const monthlyAdjustmentCreateSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.number().nonnegative(),
  category: adjustmentCategorySchema,
  sourceType: incomeSourceTypeSchema.optional(),
  startMonth: monthKeySchema,
  endMonth: monthKeySchema.optional(),
  dueDayOfMonth: z.number().int().min(1).max(31).nullable().optional()
});

export const monthlyAdjustmentPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  amount: z.number().nonnegative().optional(),
  category: adjustmentCategorySchema.optional(),
  sourceType: incomeSourceTypeSchema.optional(),
  startMonth: monthKeySchema.optional(),
  endMonth: monthKeySchema.nullable().optional(),
  dueDayOfMonth: z.number().int().min(1).max(31).nullable().optional()
});

export const alertSettingsPutSchema = z.object({
  lowMoneyLeftThreshold: z.number().nonnegative(),
  utilizationThresholdPercent: z.number().min(0).max(1000),
  dueReminderOffsets: z.array(z.number().int().min(0).max(31)).min(1).optional(),
  deliveryHoursLocal: z.array(z.number().int().min(0).max(23)).min(1).optional(),
  cooldownMinutes: z.number().int().min(0).max(1440).optional(),
  realtimePushEnabled: z.boolean().optional(),
  cronPushEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStartLocal: z.number().int().min(0).max(23).optional(),
  quietHoursEndLocal: z.number().int().min(0).max(23).optional(),
  quietHoursTimezone: z.string().trim().min(1).max(120).optional(),
  enabledTypes: z
    .object({
      lowMoneyLeft: z.boolean(),
      cardUtilization: z.boolean(),
      cardDue: z.boolean(),
      billDue: z.boolean()
    })
    .optional()
});

export const alertSnoozeSchema = z.object({
  minutes: z.number().int().min(1).max(60 * 24 * 30).optional()
});

export const alertMuteSchema = z.object({
  muted: z.boolean().optional()
});

export const loanedOutStatusSchema = z.enum(["outstanding", "paidBack"]);

export const loanedOutCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    amount: z.number().positive(),
    startMonth: monthKeySchema,
    status: loanedOutStatusSchema,
    paidBackMonth: monthKeySchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "paidBack") {
      if (!value.paidBackMonth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paidBackMonth"],
          message: "paidBackMonth is required when status is paidBack"
        });
      } else if (value.paidBackMonth < value.startMonth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paidBackMonth"],
          message: "paidBackMonth must be greater than or equal to startMonth"
        });
      }
    }
  });

export const loanedOutPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    amount: z.number().positive().optional(),
    startMonth: monthKeySchema.optional(),
    status: loanedOutStatusSchema.optional(),
    paidBackMonth: monthKeySchema.nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status !== "paidBack" && value.paidBackMonth !== undefined && value.paidBackMonth !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paidBackMonth"],
        message: "paidBackMonth can only be set when status is paidBack"
      });
    }
  });

export const bankBalancePutSchema = z.object({
  amount: z.number()
});

export const monthClosurePutSchema = z.object({
  closed: z.boolean(),
  reason: z.string().trim().max(200).optional()
});

export const reconciliationPutSchema = z.object({
  actualBalance: z.number(),
  notes: z.string().trim().max(1000).optional()
});

export const ledgerEntryPatchSchema = z.object({
  status: z.enum(["planned", "posted", "paid"])
});
