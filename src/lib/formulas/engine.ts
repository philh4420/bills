import { FORMULA_VARIANT_MAY_QUIRK, FORMULA_VARIANT_STANDARD } from "@/lib/util/constants";
import { monthRangeInclusive } from "@/lib/util/dates";
import { normalizeCurrency } from "@/lib/util/numbers";
import {
  AdjustmentCategory,
  CardAccount,
  LineItem,
  MonthlyAdjustment,
  MonthlyCardPayments,
  MonthSnapshot
} from "@/types";

export interface CardMonthProjectionEntry {
  cardId: string;
  openingBalance: number;
  interestRateApr: number;
  interestAdded: number;
  paymentAmount: number;
  closingBalance: number;
}

export interface CardMonthProjection {
  month: string;
  entries: Record<string, CardMonthProjectionEntry>;
  totalInterestAdded: number;
  totalPaymentAmount: number;
  totalClosingBalance: number;
}

export function inferFormulaVariant(formulaExpression: string | null | undefined): string {
  if (!formulaExpression) {
    return FORMULA_VARIANT_STANDARD;
  }

  // Workbook quirk: May omits C37 from H25 formula.
  return formulaExpression.includes("C37") ? FORMULA_VARIANT_STANDARD : FORMULA_VARIANT_MAY_QUIRK;
}

function totalLineItems(items: Array<Pick<LineItem, "amount">>): number {
  return normalizeCurrency(items.reduce((acc, item) => acc + item.amount, 0));
}

export function extendMonthlyPaymentsToYearEnd(
  monthlyPayments: MonthlyCardPayments[]
): MonthlyCardPayments[] {
  const sorted = monthlyPayments.slice().sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length === 0) {
    return [];
  }

  const firstMonth = sorted[0].month;
  const lastMonth = sorted[sorted.length - 1].month;
  const endMonth = `${lastMonth.slice(0, 4)}-12`;
  const allMonths = monthRangeInclusive(firstMonth, endMonth);
  const byMonth = new Map(sorted.map((payment) => [payment.month, payment]));
  const now = new Date().toISOString();

  return allMonths.map((month) => {
    const existing = byMonth.get(month);
    if (existing) {
      return existing;
    }

    return {
      month,
      byCardId: {},
      total: 0,
      formulaVariantId: FORMULA_VARIANT_STANDARD,
      formulaExpression: null,
      inferred: true,
      createdAt: now,
      updatedAt: now
    };
  });
}

export function computeCardMonthProjections(
  cards: Array<Pick<CardAccount, "id" | "usedLimit" | "interestRateApr">>,
  monthlyPayments: Array<Pick<MonthlyCardPayments, "month" | "byCardId">>
): CardMonthProjection[] {
  const balancesByCardId: Record<string, number> = {};
  cards.forEach((card) => {
    balancesByCardId[card.id] = normalizeCurrency(Math.max(0, card.usedLimit || 0));
  });

  return monthlyPayments
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((payment) => {
      const entries: Record<string, CardMonthProjectionEntry> = {};
      let totalInterestAdded = 0;
      let totalPaymentAmount = 0;
      let totalClosingBalance = 0;

      cards.forEach((card) => {
        const openingBalance = normalizeCurrency(Math.max(0, balancesByCardId[card.id] || 0));
        const interestRateApr = normalizeCurrency(Math.max(0, card.interestRateApr || 0));
        const monthlyRate = interestRateApr / 1200;
        const interestAdded = normalizeCurrency(openingBalance * monthlyRate);
        const paymentAmount = normalizeCurrency(Math.max(0, payment.byCardId[card.id] || 0));
        const closingBalance = normalizeCurrency(Math.max(0, openingBalance + interestAdded - paymentAmount));

        entries[card.id] = {
          cardId: card.id,
          openingBalance,
          interestRateApr,
          interestAdded,
          paymentAmount,
          closingBalance
        };

        balancesByCardId[card.id] = closingBalance;
        totalInterestAdded = normalizeCurrency(totalInterestAdded + interestAdded);
        totalPaymentAmount = normalizeCurrency(totalPaymentAmount + paymentAmount);
        totalClosingBalance = normalizeCurrency(totalClosingBalance + closingBalance);
      });

      return {
        month: payment.month,
        entries,
        totalInterestAdded,
        totalPaymentAmount,
        totalClosingBalance
      };
    });
}

export function computeMoneyLeft(params: {
  incomeTotal: number;
  cardSpendTotal: number;
  houseBillsTotal: number;
  shoppingTotal: number;
  myBillsTotal: number;
  formulaVariantId: string;
}): number {
  const { incomeTotal, cardSpendTotal, houseBillsTotal, shoppingTotal, myBillsTotal, formulaVariantId } =
    params;

  if (formulaVariantId === FORMULA_VARIANT_MAY_QUIRK) {
    return normalizeCurrency(incomeTotal - cardSpendTotal - houseBillsTotal - shoppingTotal);
  }

  return normalizeCurrency(incomeTotal - cardSpendTotal - houseBillsTotal - shoppingTotal - myBillsTotal);
}

function isMonthInRange(month: string, startMonth: string, endMonth?: string): boolean {
  if (month < startMonth) {
    return false;
  }

  if (endMonth && month > endMonth) {
    return false;
  }

  return true;
}

function totalAdjustmentsForMonth(
  month: string,
  category: AdjustmentCategory,
  adjustments: MonthlyAdjustment[]
): number {
  return normalizeCurrency(
    adjustments
      .filter(
        (adjustment) =>
          adjustment.category === category &&
          isMonthInRange(month, adjustment.startMonth, adjustment.endMonth)
      )
      .reduce((acc, adjustment) => acc + adjustment.amount, 0)
  );
}

export function computeMonthSnapshots(params: {
  cards: CardAccount[];
  monthlyPayments: MonthlyCardPayments[];
  houseBills: LineItem[];
  income: LineItem[];
  shopping: LineItem[];
  myBills: LineItem[];
  adjustments: MonthlyAdjustment[];
}): MonthSnapshot[] {
  const { cards, monthlyPayments, houseBills, income, shopping, myBills, adjustments } = params;
  const timelinePayments = extendMonthlyPaymentsToYearEnd(monthlyPayments);

  const baseIncomeTotal = totalLineItems(income);
  const baseHouseBillsTotal = totalLineItems(houseBills);
  const baseShoppingTotal = totalLineItems(shopping);
  const baseMyBillsTotal = totalLineItems(myBills);
  const cardProjections = computeCardMonthProjections(cards, timelinePayments);
  const cardProjectionsByMonth = new Map(cardProjections.map((projection) => [projection.month, projection]));

  return timelinePayments
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((payment) => {
      const incomeAdjustments = totalAdjustmentsForMonth(payment.month, "income", adjustments);
      const houseAdjustments = totalAdjustmentsForMonth(payment.month, "houseBills", adjustments);
      const shoppingAdjustments = totalAdjustmentsForMonth(payment.month, "shopping", adjustments);
      const myBillsAdjustments = totalAdjustmentsForMonth(payment.month, "myBills", adjustments);

      const incomeTotal = normalizeCurrency(baseIncomeTotal + incomeAdjustments);
      const houseBillsTotal = normalizeCurrency(baseHouseBillsTotal + houseAdjustments);
      const shoppingTotal = normalizeCurrency(baseShoppingTotal + shoppingAdjustments);
      const myBillsTotal = normalizeCurrency(baseMyBillsTotal + myBillsAdjustments);

      const adjustmentsTotal = normalizeCurrency(
        incomeAdjustments + houseAdjustments + shoppingAdjustments + myBillsAdjustments
      );

      const cardProjection = cardProjectionsByMonth.get(payment.month);
      const cardSpendTotal = cardProjection?.totalPaymentAmount ?? 0;
      const cardInterestTotal = cardProjection?.totalInterestAdded ?? 0;
      const cardBalanceTotal = cardProjection?.totalClosingBalance ?? 0;
      const moneyLeft = computeMoneyLeft({
        incomeTotal,
        cardSpendTotal,
        houseBillsTotal,
        shoppingTotal,
        myBillsTotal,
        formulaVariantId: payment.formulaVariantId
      });

      const now = new Date().toISOString();
      return {
        month: payment.month,
        incomeTotal,
        houseBillsTotal,
        shoppingTotal,
        myBillsTotal,
        adjustmentsTotal,
        cardInterestTotal,
        cardBalanceTotal,
        cardSpendTotal,
        moneyLeft,
        formulaVariantId: payment.formulaVariantId,
        inferred: payment.inferred,
        createdAt: now,
        updatedAt: now
      };
    });
}
