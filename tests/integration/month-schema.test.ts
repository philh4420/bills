import { describe, expect, it } from "vitest";

import { monthKeySchema } from "@/lib/api/schemas";

describe("month key validation", () => {
  it("accepts YYYY-MM", () => {
    expect(monthKeySchema.safeParse("2026-12").success).toBe(true);
  });

  it("rejects invalid month", () => {
    expect(monthKeySchema.safeParse("2026-99").success).toBe(false);
    expect(monthKeySchema.safeParse("26-01").success).toBe(false);
  });
});
