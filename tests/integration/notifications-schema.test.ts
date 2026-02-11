import { describe, expect, it } from "vitest";

import {
  cardPatchSchema,
  pushSubscriptionDeleteSchema,
  pushSubscriptionUpsertSchema
} from "@/lib/api/schemas";

describe("notification and card schema validation", () => {
  it("accepts nullable due day patch values", () => {
    expect(cardPatchSchema.safeParse({ dueDayOfMonth: 15 }).success).toBe(true);
    expect(cardPatchSchema.safeParse({ dueDayOfMonth: null }).success).toBe(true);
    expect(cardPatchSchema.safeParse({ dueDayOfMonth: 0 }).success).toBe(false);
    expect(cardPatchSchema.safeParse({ dueDayOfMonth: 32 }).success).toBe(false);
  });

  it("validates push subscription upsert payload", () => {
    const parsed = pushSubscriptionUpsertSchema.safeParse({
      subscription: {
        endpoint: "https://example.push.service/subscription",
        expirationTime: null,
        keys: {
          auth: "abc",
          p256dh: "def"
        }
      },
      userAgent: "Mozilla/5.0"
    });

    expect(parsed.success).toBe(true);
  });

  it("validates push subscription delete payload", () => {
    expect(
      pushSubscriptionDeleteSchema.safeParse({
        endpoint: "https://example.push.service/subscription"
      }).success
    ).toBe(true);
  });
});
