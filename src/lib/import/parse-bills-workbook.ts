import * as XLSX from "xlsx";

import { inferFormulaVariant } from "@/lib/formulas/engine";
import { monthKeyFromExcelValue, monthRangeInclusive } from "@/lib/util/dates";
import { KNOWN_CARD_NAMES } from "@/lib/util/constants";
import { normalizeCurrency, toNumber } from "@/lib/util/numbers";
import { ImportedWorkbookSnapshot, ImportSummary, MonthKey } from "@/types";

function str(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) {
    return "";
  }
  return String(cell.v).trim();
}

function num(cell: XLSX.CellObject | undefined): number {
  return normalizeCurrency(toNumber(cell?.v));
}

function readCell(ws: XLSX.WorkSheet, addr: string): XLSX.CellObject | undefined {
  return ws[addr];
}

function sheetLastRow(sheet: XLSX.WorkSheet): number {
  const ref = sheet["!ref"];
  if (!ref) {
    return 1;
  }

  const range = XLSX.utils.decode_range(ref);
  return range.e.r + 1;
}

function findRowByLabel(
  sheet: XLSX.WorkSheet,
  column: string,
  label: string,
  startRow: number,
  endRow: number
): number | null {
  const needle = label.trim().toLowerCase();
  for (let row = startRow; row <= endRow; row += 1) {
    const value = str(readCell(sheet, `${column}${row}`)).toLowerCase();
    if (value === needle) {
      return row;
    }
  }

  return null;
}

function hasCellValue(cell: XLSX.CellObject | undefined): boolean {
  if (!cell || cell.v === undefined || cell.v === null) {
    return false;
  }
  return String(cell.v).trim() !== "";
}

function collectCardAccounts(sheet: XLSX.WorkSheet) {
  const columns = ["C", "D", "E", "F", "G", "H"];
  const names = columns.map((col) => str(readCell(sheet, `${col}3`)));

  return names.map((name, idx) => {
    const safeName = name || KNOWN_CARD_NAMES[idx] || `Card ${idx + 1}`;
    return {
      name: safeName,
      limit: num(readCell(sheet, `${columns[idx]}4`)),
      usedLimit: num(readCell(sheet, `${columns[idx]}5`)),
      interestRateApr: 0
    };
  });
}

function collectMoneyLeftFormulaByMonth(sheet: XLSX.WorkSheet): Map<string, { expr: string | null; variant: string }> {
  const out = new Map<string, { expr: string | null; variant: string }>();
  const lastRow = sheetLastRow(sheet);
  const moneyLeftLabelRow = findRowByLabel(sheet, "G", "Money Left", 18, Math.min(lastRow, 80));
  const startRow = (moneyLeftLabelRow ?? 20) + 1;
  const endRow = Math.min(lastRow, startRow + 24);

  for (let row = startRow; row <= endRow; row += 1) {
    const month = monthKeyFromExcelValue(readCell(sheet, `G${row}`)?.v);
    if (!month) {
      continue;
    }

    const formulaExpression = readCell(sheet, `H${row}`)?.f ?? null;
    out.set(month, {
      expr: formulaExpression,
      variant: inferFormulaVariant(formulaExpression)
    });
  }

  return out;
}

function collectMonthlyPayments(sheet: XLSX.WorkSheet, cardNames: string[]) {
  const columns = ["C", "D", "E", "F", "G", "H"];
  const lastRow = sheetLastRow(sheet);
  const leftToPayRow = findRowByLabel(sheet, "B", "Left To Pay", 7, Math.min(lastRow, 80));
  const startRow = 7;
  const endRow = Math.max(startRow, (leftToPayRow ?? Math.min(lastRow, 24)) - 1);

  const explicitRows: Array<{
    month: MonthKey;
    byCardName: Record<string, number>;
    spendTotal: number;
    formulaExpression: string | null;
    formulaVariantId: string;
    inferred: boolean;
  }> = [];

  const moneyLeftFormulaByMonth = collectMoneyLeftFormulaByMonth(sheet);
  const lastSeenByCardName: Record<string, number> = {};
  cardNames.forEach((name) => {
    lastSeenByCardName[name] = 0;
  });

  for (let row = startRow; row <= endRow; row += 1) {
    const month = monthKeyFromExcelValue(readCell(sheet, `B${row}`)?.v);
    if (!month) {
      continue;
    }

    const byCardName: Record<string, number> = {};
    cardNames.forEach((cardName, idx) => {
      const cell = readCell(sheet, `${columns[idx]}${row}`);
      if (hasCellValue(cell)) {
        const value = num(cell);
        byCardName[cardName] = value;
        lastSeenByCardName[cardName] = value;
      } else {
        byCardName[cardName] = lastSeenByCardName[cardName] ?? 0;
      }
    });

    const spendTotal = normalizeCurrency(
      Object.values(byCardName).reduce((acc, amount) => acc + amount, 0)
    );

    const formulaMeta = moneyLeftFormulaByMonth.get(month);
    explicitRows.push({
      month,
      byCardName,
      spendTotal,
      formulaExpression: formulaMeta?.expr ?? null,
      formulaVariantId: formulaMeta?.variant ?? inferFormulaVariant(null),
      inferred: false
    });
  }

  if (explicitRows.length === 0) {
    return {
      rows: explicitRows,
      inferredMonths: [] as string[]
    };
  }

  const sorted = explicitRows.slice().sort((a, b) => a.month.localeCompare(b.month));
  const allMonths = monthRangeInclusive(sorted[0].month, sorted[sorted.length - 1].month);
  const byMonth = new Map(sorted.map((row) => [row.month, row]));
  const inferredMonths: string[] = [];

  let previousRow: (typeof sorted)[number] | null = null;

  const filled = allMonths.map((month) => {
    const existing = byMonth.get(month);
    if (existing) {
      previousRow = existing;
      return existing;
    }

    inferredMonths.push(month);

    const carriedByCardName: Record<string, number> = {};
    cardNames.forEach((name) => {
      carriedByCardName[name] = previousRow?.byCardName[name] ?? 0;
    });

    const spendTotal = normalizeCurrency(
      Object.values(carriedByCardName).reduce((acc, amount) => acc + amount, 0)
    );

    const formulaMeta = moneyLeftFormulaByMonth.get(month);
    const inferredRow = {
      month: month as MonthKey,
      byCardName: carriedByCardName,
      spendTotal,
      formulaExpression: formulaMeta?.expr ?? null,
      formulaVariantId: formulaMeta?.variant ?? inferFormulaVariant(null),
      inferred: true
    };

    previousRow = inferredRow;
    return inferredRow;
  });

  return {
    rows: filled,
    inferredMonths
  };
}

function collectLineItems(
  sheet: XLSX.WorkSheet,
  rowStart: number,
  rowEnd: number,
  nameColumn: string,
  amountColumn: string,
  blockedNames: Set<string>
) {
  const items: Array<{ name: string; amount: number }> = [];

  for (let row = rowStart; row <= rowEnd; row += 1) {
    const name = str(readCell(sheet, `${nameColumn}${row}`));
    if (!name || blockedNames.has(name)) {
      continue;
    }

    const amount = num(readCell(sheet, `${amountColumn}${row}`));
    if (amount <= 0) {
      continue;
    }

    items.push({ name, amount });
  }

  return items;
}

function collectPurchases(sheet: XLSX.WorkSheet) {
  const purchases: Array<{ name: string; price: number; alias?: string; link?: string; status: "planned" }> = [];

  for (let row = 3; row <= 26; row += 1) {
    const nameCell = readCell(sheet, `B${row}`);
    const name = str(nameCell);
    if (!name) {
      continue;
    }

    const price = num(readCell(sheet, `C${row}`));
    const aliasCell = readCell(sheet, `D${row}`);
    const alias = str(aliasCell) || undefined;
    const link = aliasCell?.l?.Target;

    purchases.push({
      name,
      price,
      alias,
      link,
      status: "planned"
    });
  }

  return purchases;
}

export function parseBillsWorkbook(input: { fileName: string; buffer: ArrayBuffer }): {
  snapshot: ImportedWorkbookSnapshot;
  summary: ImportSummary;
} {
  const workbook = XLSX.read(input.buffer, {
    type: "array",
    cellDates: false,
    cellFormula: true
  });

  const ongoingSheet = workbook.Sheets["Ongoing Bills 2026"];
  const purchasesSheet = workbook.Sheets["PURCHASES NEXT YEAR OR SO"];

  if (!ongoingSheet || !purchasesSheet) {
    throw new Error("Workbook must include sheets: Ongoing Bills 2026 and PURCHASES NEXT YEAR OR SO");
  }

  const cardAccounts = collectCardAccounts(ongoingSheet);
  const cardNames = cardAccounts.map((card) => card.name);

  const monthly = collectMonthlyPayments(ongoingSheet, cardNames);

  const houseBills = collectLineItems(
    ongoingSheet,
    21,
    28,
    "B",
    "C",
    new Set(["House Bills", "Total", "My Bills"])
  );

  const income = collectLineItems(
    ongoingSheet,
    21,
    24,
    "D",
    "E",
    new Set(["Income", "Total", "Shopping"])
  );

  const shopping = collectLineItems(
    ongoingSheet,
    26,
    28,
    "D",
    "E",
    new Set(["Shopping", "Total"])
  );

  const myBills = collectLineItems(
    ongoingSheet,
    32,
    36,
    "B",
    "C",
    new Set(["My Bills", "Total"])
  );

  const purchases = collectPurchases(purchasesSheet);

  const warnings: string[] = [];
  if (monthly.inferredMonths.length > 0) {
    warnings.push(`Inferred missing month rows: ${monthly.inferredMonths.join(", ")}`);
  }

  const snapshot: ImportedWorkbookSnapshot = {
    cardAccounts,
    monthlyPayments: monthly.rows,
    houseBills,
    income,
    shopping,
    myBills,
    purchases
  };

  const monthSet = new Set(snapshot.monthlyPayments.map((entry) => entry.month));

  const summary: ImportSummary = {
    cardCount: snapshot.cardAccounts.length,
    monthlyRows: snapshot.monthlyPayments.length,
    monthCount: monthSet.size,
    houseBillCount: snapshot.houseBills.length,
    incomeCount: snapshot.income.length,
    shoppingCount: snapshot.shopping.length,
    myBillCount: snapshot.myBills.length,
    purchaseCount: snapshot.purchases.length,
    inferredMonths: monthly.inferredMonths as MonthKey[],
    warnings
  };

  return { snapshot, summary };
}
