import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseBillsWorkbook } from "@/lib/import/parse-bills-workbook";

describe("parseBillsWorkbook", () => {
  function parseFixture(buffer: Buffer) {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;

    return parseBillsWorkbook({
      fileName: "Bills.xlsx",
      buffer: arrayBuffer
    });
  }

  it("parses workbook sections and infers missing month", () => {
    const filePath = resolve(process.cwd(), "tests/fixtures/Bills.xlsx");
    const fileBuffer = readFileSync(filePath);

    const parsed = parseFixture(fileBuffer);

    expect(parsed.summary.cardCount).toBe(6);
    expect(parsed.summary.monthCount).toBe(12);
    expect(parsed.summary.monthlyRows).toBe(12);
    expect(parsed.summary.houseBillCount).toBe(8);
    expect(parsed.summary.incomeCount).toBe(2);
    expect(parsed.summary.shoppingCount).toBe(3);
    expect(parsed.summary.myBillCount).toBe(3);
    expect(parsed.summary.purchaseCount).toBe(13);
    expect(parsed.summary.inferredMonths).toContain("2026-09");
    expect(parsed.summary.warnings.join(" ")).toContain("2026-09");

    const aug = parsed.snapshot.monthlyPayments.find((entry) => entry.month === "2026-08");
    const sep = parsed.snapshot.monthlyPayments.find((entry) => entry.month === "2026-09");
    expect(aug).toBeTruthy();
    expect(sep).toBeTruthy();
    expect(sep?.spendTotal).toBe(aug?.spendTotal);
    expect(parsed.snapshot.cardAccounts.every((card) => card.interestRateApr === 0)).toBe(true);
  });

  it("includes December when payment and formula month rows are shifted down", () => {
    const filePath = resolve(process.cwd(), "tests/fixtures/Bills.xlsx");
    const fileBuffer = readFileSync(filePath);

    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false, cellFormula: true });
    const sheet = workbook.Sheets["Ongoing Bills 2026"];
    expect(sheet).toBeTruthy();

    if (!sheet) {
      return;
    }

    // Shift Dec payment row down by one row to simulate workbook variants where Left To Pay moves down.
    const paymentColumns = ["B", "C", "D", "E", "F", "G", "H", "I"];
    paymentColumns.forEach((column) => {
      const source = `${column}17`;
      const target = `${column}18`;
      if (sheet[source]) {
        sheet[target] = sheet[source];
        delete sheet[source];
      }
    });
    sheet.B19 = { t: "s", v: "Left To Pay" };

    // Shift money-left month/formula rows down by one (G21:H31 -> G22:H32).
    for (let row = 31; row >= 21; row -= 1) {
      const sourceMonth = `G${row}`;
      const sourceFormula = `H${row}`;
      const targetMonth = `G${row + 1}`;
      const targetFormula = `H${row + 1}`;

      if (sheet[sourceMonth]) {
        sheet[targetMonth] = sheet[sourceMonth];
      } else {
        delete sheet[targetMonth];
      }

      if (sheet[sourceFormula]) {
        sheet[targetFormula] = sheet[sourceFormula];
      } else {
        delete sheet[targetFormula];
      }

      delete sheet[sourceMonth];
      delete sheet[sourceFormula];
    }

    sheet.G21 = { t: "s", v: "Money Left" };

    const shiftedBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx"
    }) as Buffer;

    const parsed = parseFixture(shiftedBuffer);

    expect(parsed.summary.monthCount).toBe(12);
    expect(parsed.summary.monthlyRows).toBe(12);
    expect(parsed.snapshot.monthlyPayments.some((entry) => entry.month === "2026-12")).toBe(true);
  });
});
