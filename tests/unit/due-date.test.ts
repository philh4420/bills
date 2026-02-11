import { describe, expect, it } from "vitest";

import { computeUpcomingDueDate, formatDueDateLabel } from "@/lib/cards/due-date";

describe("card due date helpers", () => {
  it("keeps due date in current month when still upcoming", () => {
    const result = computeUpcomingDueDate(15, new Date("2026-03-10T12:00:00Z"));
    expect(result.isoDate).toBe("2026-03-15");
    expect(result.daysUntil).toBe(5);
  });

  it("rolls to next month when due day already passed", () => {
    const result = computeUpcomingDueDate(15, new Date("2026-03-30T12:00:00Z"));
    expect(result.isoDate).toBe("2026-04-15");
    expect(result.daysUntil).toBe(16);
  });

  it("clamps due day to month length", () => {
    const result = computeUpcomingDueDate(31, new Date("2026-02-20T12:00:00Z"));
    expect(result.isoDate).toBe("2026-02-28");
    expect(result.daysUntil).toBe(8);
  });

  it("formats due labels in en-GB style", () => {
    expect(formatDueDateLabel("2026-12-03")).toContain("03 Dec 2026");
  });
});
