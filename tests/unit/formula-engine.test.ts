import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { computeMonthSnapshots, extendMonthlyPaymentsToYearEnd } from "@/lib/formulas/engine";
import { parseBillsWorkbook } from "@/lib/import/parse-bills-workbook";

function toCardId(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

describe("formula engine", () => {
  it("matches workbook parity for key months including May quirk", () => {
    const filePath = resolve(process.cwd(), "tests/fixtures/Bills.xlsx");
    const fileBuffer = readFileSync(filePath);

    const parsed = parseBillsWorkbook({
      fileName: "Bills.xlsx",
      buffer: fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
      )
    });

    const cards = parsed.snapshot.cardAccounts.map((card) => ({
      id: toCardId(card.name),
      name: card.name,
      limit: card.limit,
      usedLimit: card.usedLimit,
      interestRateApr: card.interestRateApr,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }));

    const cardNameToId = new Map(cards.map((card) => [card.name, card.id]));

    const monthlyPayments = parsed.snapshot.monthlyPayments.map((payment) => ({
      month: payment.month,
      byCardId: Object.fromEntries(
        Object.entries(payment.byCardName).map(([name, amount]) => [cardNameToId.get(name)!, amount])
      ),
      total: payment.spendTotal,
      formulaVariantId: payment.formulaVariantId,
      formulaExpression: payment.formulaExpression,
      inferred: payment.inferred,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }));

    const lineItem = (name: string, amount: number) => ({
      id: name,
      name,
      amount,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    const snapshots = computeMonthSnapshots({
      cards,
      monthlyPayments,
      houseBills: parsed.snapshot.houseBills.map((entry) => lineItem(entry.name, entry.amount)),
      income: parsed.snapshot.income.map((entry) => lineItem(entry.name, entry.amount)),
      shopping: parsed.snapshot.shopping.map((entry) => lineItem(entry.name, entry.amount)),
      myBills: parsed.snapshot.myBills.map((entry) => lineItem(entry.name, entry.amount)),
      adjustments: []
    });

    const jan = snapshots.find((entry) => entry.month === "2026-01");
    const may = snapshots.find((entry) => entry.month === "2026-05");
    const sep = snapshots.find((entry) => entry.month === "2026-09");

    expect(jan?.moneyLeft).toBe(287.37);
    expect(jan?.cardInterestTotal).toBe(0);
    expect(may?.moneyLeft).toBe(322.94);
    expect(sep?.moneyLeft).toBe(287.37);
    expect(sep?.adjustmentsTotal).toBe(0);
    expect(sep?.inferred).toBe(true);
  });

  it("applies monthly adjustments by range", () => {
    const cards = [
      {
        id: "fluid",
        name: "Fluid",
        limit: 450,
        usedLimit: 398,
        interestRateApr: 12,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    const monthlyPayments = [
      {
        month: "2026-03",
        byCardId: { fluid: 100 },
        total: 100,
        formulaVariantId: "money-left-standard",
        formulaExpression: null,
        inferred: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        month: "2026-04",
        byCardId: { fluid: 100 },
        total: 100,
        formulaVariantId: "money-left-standard",
        formulaExpression: null,
        inferred: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    const snapshots = computeMonthSnapshots({
      cards,
      monthlyPayments,
      houseBills: [{ id: "base", name: "Base", amount: 200, createdAt: "", updatedAt: "" }],
      income: [{ id: "income", name: "Income", amount: 1000, createdAt: "", updatedAt: "" }],
      shopping: [],
      myBills: [],
      adjustments: [
        {
          id: "march-double",
          name: "Broadband first invoice",
          amount: 80,
          category: "houseBills",
          startMonth: "2026-03",
          endMonth: "2026-03",
          createdAt: "",
          updatedAt: ""
        },
        {
          id: "from-apr",
          name: "Broadband ongoing",
          amount: 40,
          category: "houseBills",
          startMonth: "2026-04",
          endMonth: undefined,
          createdAt: "",
          updatedAt: ""
        }
      ]
    });

    const march = snapshots.find((entry) => entry.month === "2026-03");
    const april = snapshots.find((entry) => entry.month === "2026-04");

    expect(march?.houseBillsTotal).toBe(280);
    expect(march?.moneyLeft).toBe(620);
    expect(march?.adjustmentsTotal).toBe(80);
    expect(march?.cardInterestTotal).toBe(3.98);
    expect(march?.cardBalanceTotal).toBe(301.98);

    expect(april?.houseBillsTotal).toBe(240);
    expect(april?.moneyLeft).toBe(660);
    expect(april?.adjustmentsTotal).toBe(40);
    expect(april?.cardInterestTotal).toBe(3.02);
    expect(april?.cardBalanceTotal).toBe(205);
  });

  it("extends payment timeline to December and keeps missing months at zero payment", () => {
    const payments = extendMonthlyPaymentsToYearEnd([
      {
        month: "2026-01",
        byCardId: { fluid: 100 },
        total: 100,
        formulaVariantId: "money-left-standard",
        formulaExpression: null,
        inferred: false,
        createdAt: "",
        updatedAt: ""
      },
      {
        month: "2026-11",
        byCardId: { fluid: 50 },
        total: 50,
        formulaVariantId: "money-left-standard",
        formulaExpression: null,
        inferred: false,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    expect(payments[0]?.month).toBe("2026-01");
    expect(payments[payments.length - 1]?.month).toBe("2026-12");
    const december = payments.find((entry) => entry.month === "2026-12");
    expect(december).toBeTruthy();
    expect(december?.total).toBe(0);
    expect(december?.byCardId).toEqual({});
  });
});
