import { monthRangeInclusive } from "@/lib/util/dates";
import { normalizeCurrency } from "@/lib/util/numbers";
import { resolveIncomePaydaysForMonth } from "@/lib/payday/mode";
import {
  AnalyticsCategoryDelta,
  AnalyticsSummary,
  CardAccount,
  DebtPayoffStrategySummary,
  DebtPayoffSummary,
  LineItem,
  MonthSnapshot,
  MonthlyCardPayments,
  NetWorthSummary,
  PaydayModeSettings,
  PlanningSummary,
  SavingsGoal,
  SavingsGoalProjection,
  SavingsProjectionSummary
} from "@/types";

function toMonthIndex(month: string): number {
  const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) {
    return Number.NaN;
  }
  return Number.parseInt(match[1], 10) * 12 + Number.parseInt(match[2], 10) - 1;
}

function compareMonths(a: string, b: string): number {
  return toMonthIndex(a) - toMonthIndex(b);
}

function addMonths(month: string, delta: number): string {
  const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) {
    return month;
  }
  const startYear = Number.parseInt(match[1], 10);
  const startMonth = Number.parseInt(match[2], 10);
  const absolute = startYear * 12 + (startMonth - 1) + delta;
  const year = Math.floor(absolute / 12);
  const monthNumber = (absolute % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}`;
}

function isMonthInRange(month: string, startMonth: string, endMonth?: string): boolean {
  if (compareMonths(month, startMonth) < 0) {
    return false;
  }
  if (endMonth && compareMonths(month, endMonth) > 0) {
    return false;
  }
  return true;
}

function percentageDelta(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.0001) {
    if (Math.abs(current) < 0.0001) {
      return 0;
    }
    return null;
  }
  return normalizeCurrency(((current - previous) / Math.abs(previous)) * 100);
}

function computeMinimumPaymentAmount(
  statementBalance: number,
  card: Pick<CardAccount, "minimumPaymentRule">
): number {
  const rule = card.minimumPaymentRule;
  if (!Number.isFinite(statementBalance) || statementBalance <= 0) {
    return 0;
  }

  if (!rule) {
    return normalizeCurrency(Math.min(statementBalance, Math.max(5, statementBalance * 0.02)));
  }

  if (rule.type === "fixed") {
    return normalizeCurrency(Math.min(statementBalance, Math.max(0, rule.value)));
  }

  return normalizeCurrency(Math.min(statementBalance, statementBalance * (Math.max(0, rule.value) / 100)));
}

function normalizeDebtBudget(
  cards: CardAccount[],
  startBalancesByCardId: Record<string, number>,
  selectedMonthlyPayment: MonthlyCardPayments | null
): number {
  const configuredBudget = normalizeCurrency(
    selectedMonthlyPayment
      ? Object.values(selectedMonthlyPayment.byCardId || {}).reduce((acc, value) => acc + Math.max(0, value), 0)
      : 0
  );

  const requiredMinimumTotal = normalizeCurrency(
    cards.reduce((acc, card) => {
      const balance = Math.max(0, startBalancesByCardId[card.id] || 0);
      return acc + computeMinimumPaymentAmount(balance, card);
    }, 0)
  );

  return normalizeCurrency(Math.max(configuredBudget, requiredMinimumTotal));
}

function sortIdsForStrategy(
  strategy: "snowball" | "avalanche",
  cardsById: Map<string, CardAccount>,
  balancesByCardId: Record<string, number>
): string[] {
  const ids = Array.from(cardsById.keys()).filter((id) => balancesByCardId[id] > 0.0001);
  if (strategy === "snowball") {
    return ids.sort((left, right) => {
      const balanceDiff = balancesByCardId[left] - balancesByCardId[right];
      if (balanceDiff !== 0) {
        return balanceDiff;
      }
      const leftCard = cardsById.get(left);
      const rightCard = cardsById.get(right);
      return (leftCard?.name || left).localeCompare(rightCard?.name || right);
    });
  }

  return ids.sort((left, right) => {
    const leftApr = cardsById.get(left)?.interestRateApr ?? 0;
    const rightApr = cardsById.get(right)?.interestRateApr ?? 0;
    if (rightApr !== leftApr) {
      return rightApr - leftApr;
    }
    const balanceDiff = balancesByCardId[right] - balancesByCardId[left];
    if (balanceDiff !== 0) {
      return balanceDiff;
    }
    const leftCard = cardsById.get(left);
    const rightCard = cardsById.get(right);
    return (leftCard?.name || left).localeCompare(rightCard?.name || right);
  });
}

function simulateDebtStrategy(params: {
  strategy: "snowball" | "avalanche";
  cards: CardAccount[];
  startBalancesByCardId: Record<string, number>;
  monthlyBudget: number;
  selectedMonthlyPayment: MonthlyCardPayments | null;
}): DebtPayoffStrategySummary {
  const cardsById = new Map(params.cards.map((card) => [card.id, card]));
  const balancesByCardId: Record<string, number> = Object.fromEntries(
    params.cards.map((card) => [card.id, normalizeCurrency(Math.max(0, params.startBalancesByCardId[card.id] || 0))])
  );
  const payoffOrder: string[] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;

  const maxMonths = 600;
  for (let monthIndex = 0; monthIndex < maxMonths; monthIndex += 1) {
    const activeIds = Object.keys(balancesByCardId).filter((id) => balancesByCardId[id] > 0.0001);
    if (activeIds.length === 0) {
      break;
    }

    months += 1;

    activeIds.forEach((id) => {
      const card = cardsById.get(id);
      if (!card) {
        return;
      }
      const opening = balancesByCardId[id];
      const interest = normalizeCurrency(opening * (Math.max(0, card.interestRateApr || 0) / 1200));
      balancesByCardId[id] = normalizeCurrency(opening + interest);
      totalInterest = normalizeCurrency(totalInterest + interest);
    });

    const minimumById: Record<string, number> = {};
    const configuredById = params.selectedMonthlyPayment?.byCardId || {};
    let minimumTotal = 0;
    activeIds.forEach((id) => {
      const card = cardsById.get(id);
      if (!card) {
        return;
      }
      const statementBalance = balancesByCardId[id];
      const ruleMinimum = computeMinimumPaymentAmount(statementBalance, card);
      const configuredMinimum = normalizeCurrency(Math.max(0, configuredById[id] || 0));
      const minimum = normalizeCurrency(Math.min(statementBalance, Math.max(ruleMinimum, configuredMinimum)));
      minimumById[id] = minimum;
      minimumTotal = normalizeCurrency(minimumTotal + minimum);
    });

    const budget = normalizeCurrency(Math.max(params.monthlyBudget, minimumTotal));
    let remaining = budget;

    activeIds.forEach((id) => {
      const minimum = Math.min(balancesByCardId[id], minimumById[id] || 0);
      if (minimum <= 0) {
        return;
      }
      balancesByCardId[id] = normalizeCurrency(Math.max(0, balancesByCardId[id] - minimum));
      totalPaid = normalizeCurrency(totalPaid + minimum);
      remaining = normalizeCurrency(Math.max(0, remaining - minimum));
      if (balancesByCardId[id] <= 0.0001 && !payoffOrder.includes(id)) {
        payoffOrder.push(id);
      }
    });

    while (remaining > 0.0001) {
      const orderedIds = sortIdsForStrategy(params.strategy, cardsById, balancesByCardId);
      const targetId = orderedIds[0];
      if (!targetId) {
        break;
      }
      const extra = Math.min(remaining, balancesByCardId[targetId]);
      balancesByCardId[targetId] = normalizeCurrency(Math.max(0, balancesByCardId[targetId] - extra));
      totalPaid = normalizeCurrency(totalPaid + extra);
      remaining = normalizeCurrency(Math.max(0, remaining - extra));
      if (balancesByCardId[targetId] <= 0.0001 && !payoffOrder.includes(targetId)) {
        payoffOrder.push(targetId);
      }
    }
  }

  const unresolved = Object.values(balancesByCardId).some((balance) => balance > 0.0001);
  const mappedPayoffOrder = payoffOrder
    .map((id) => cardsById.get(id)?.name || id)
    .filter((value, index, array) => array.indexOf(value) === index);

  return {
    strategy: params.strategy,
    monthlyBudget: params.monthlyBudget,
    monthsToDebtFree: unresolved ? null : months,
    totalInterest,
    totalPaid,
    payoffOrder: mappedPayoffOrder
  };
}

function buildDebtPayoffSummary(params: {
  cards: CardAccount[];
  selectedProjectionByCardId: Record<string, { closingBalance: number }>;
  selectedMonthlyPayment: MonthlyCardPayments | null;
}): DebtPayoffSummary {
  const startBalancesByCardId: Record<string, number> = {};
  params.cards.forEach((card) => {
    const projected = params.selectedProjectionByCardId[card.id]?.closingBalance;
    startBalancesByCardId[card.id] = normalizeCurrency(
      Math.max(0, Number.isFinite(projected) ? projected : card.usedLimit || 0)
    );
  });

  const totalDebt = normalizeCurrency(
    Object.values(startBalancesByCardId).reduce((acc, value) => acc + Math.max(0, value), 0)
  );
  const monthlyBudget = normalizeDebtBudget(params.cards, startBalancesByCardId, params.selectedMonthlyPayment);

  return {
    totalDebt,
    monthlyBudget,
    byStrategy: {
      snowball: simulateDebtStrategy({
        strategy: "snowball",
        cards: params.cards,
        startBalancesByCardId,
        monthlyBudget,
        selectedMonthlyPayment: params.selectedMonthlyPayment
      }),
      avalanche: simulateDebtStrategy({
        strategy: "avalanche",
        cards: params.cards,
        startBalancesByCardId,
        monthlyBudget,
        selectedMonthlyPayment: params.selectedMonthlyPayment
      })
    }
  };
}

function computeGoalCompletionMonth(
  goal: SavingsGoal,
  selectedMonth: string
): string | null {
  const startMonth = goal.startMonth;
  const endMonthLimit = goal.targetMonth;
  let running = normalizeCurrency(Math.max(0, Math.min(goal.targetAmount, goal.currentAmount)));
  if (running >= goal.targetAmount - 0.0001) {
    return startMonth;
  }

  const horizonEnd = addMonths(selectedMonth, 120);
  const loopEnd = endMonthLimit && compareMonths(endMonthLimit, horizonEnd) < 0 ? endMonthLimit : horizonEnd;
  const months = monthRangeInclusive(startMonth, loopEnd);

  for (const month of months) {
    const inRange = isMonthInRange(month, startMonth, endMonthLimit);
    if (!inRange || goal.status !== "active") {
      continue;
    }
    const remaining = normalizeCurrency(Math.max(0, goal.targetAmount - running));
    if (remaining <= 0.0001) {
      return month;
    }
    const add = normalizeCurrency(Math.min(remaining, Math.max(0, goal.monthlyContribution)));
    running = normalizeCurrency(running + add);
    if (running >= goal.targetAmount - 0.0001) {
      return month;
    }
  }

  return null;
}

function buildSavingsProjection(params: {
  selectedMonth: string;
  selectedSnapshot: MonthSnapshot | null;
  goals: SavingsGoal[];
}): SavingsProjectionSummary {
  const goalsSorted = params.goals
    .slice()
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.name.localeCompare(b.name));

  const goalProjections: SavingsGoalProjection[] = goalsSorted.map((goal) => {
    const activeForMonth = goal.status === "active" && isMonthInRange(params.selectedMonth, goal.startMonth, goal.targetMonth);
    const remaining = normalizeCurrency(Math.max(0, goal.targetAmount - goal.currentAmount));
    const monthContribution = activeForMonth ? normalizeCurrency(Math.min(remaining, goal.monthlyContribution)) : 0;
    const projectedCompletionMonth = computeGoalCompletionMonth(goal, params.selectedMonth);
    return {
      id: goal.id,
      name: goal.name,
      status: goal.status,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
      startMonth: goal.startMonth,
      targetMonth: goal.targetMonth,
      projectedCompletionMonth,
      remainingAmount: remaining,
      monthContribution
    };
  });

  const monthlyTargetTotal = normalizeCurrency(
    goalProjections.reduce((acc, goal) => acc + goal.monthContribution, 0)
  );
  const projectedMoneyLeftAfterSavings = normalizeCurrency(
    (params.selectedSnapshot?.moneyLeft ?? 0) - monthlyTargetTotal
  );
  const atRiskGoalIds = goalProjections
    .filter((goal) => {
      if (!goal.targetMonth || goal.status !== "active") {
        return false;
      }
      if (!goal.projectedCompletionMonth) {
        return true;
      }
      return compareMonths(goal.projectedCompletionMonth, goal.targetMonth) > 0;
    })
    .map((goal) => goal.id);

  return {
    selectedMonth: params.selectedMonth,
    monthlyTargetTotal,
    projectedMoneyLeftAfterSavings,
    goals: goalProjections,
    atRiskGoalIds
  };
}

function buildNetWorthSummary(params: {
  selectedMonth: string;
  snapshots: MonthSnapshot[];
  selectedSnapshot: MonthSnapshot | null;
}): NetWorthSummary {
  const snapshot = params.selectedSnapshot;
  if (!snapshot) {
    return {
      month: params.selectedMonth,
      assets: 0,
      liabilities: 0,
      loanedOutRecoverable: 0,
      netWorth: 0,
      monthDelta: 0
    };
  }

  const assets = normalizeCurrency(snapshot.moneyInBank + snapshot.loanedOutOutstandingTotal);
  const liabilities = normalizeCurrency(Math.max(0, snapshot.cardBalanceTotal));
  const netWorth = normalizeCurrency(assets - liabilities);
  const index = params.snapshots.findIndex((entry) => entry.month === params.selectedMonth);
  const previous = index > 0 ? params.snapshots[index - 1] : null;
  const previousNetWorth = previous
    ? normalizeCurrency(previous.moneyInBank + previous.loanedOutOutstandingTotal - Math.max(0, previous.cardBalanceTotal))
    : netWorth;

  return {
    month: params.selectedMonth,
    assets,
    liabilities,
    loanedOutRecoverable: normalizeCurrency(snapshot.loanedOutOutstandingTotal),
    netWorth,
    monthDelta: normalizeCurrency(netWorth - previousNetWorth)
  };
}

function buildAnalyticsSummary(params: {
  selectedMonth: string;
  snapshots: MonthSnapshot[];
  selectedSnapshot: MonthSnapshot | null;
}): AnalyticsSummary {
  const index = params.snapshots.findIndex((entry) => entry.month === params.selectedMonth);
  const current = params.selectedSnapshot;
  const previous = index > 0 ? params.snapshots[index - 1] : null;

  const defaultSummary: AnalyticsSummary = {
    month: params.selectedMonth,
    previousMonth: previous?.month,
    deltas: [],
    driftAlerts: []
  };

  if (!current || !previous) {
    return defaultSummary;
  }

  const categories: Array<{ key: AnalyticsCategoryDelta["key"]; label: string; current: number; previous: number }> = [
    { key: "income", label: "Income", current: current.incomeTotal, previous: previous.incomeTotal },
    { key: "cardSpend", label: "Card spend", current: current.cardSpendTotal, previous: previous.cardSpendTotal },
    { key: "houseBills", label: "House bills", current: current.houseBillsTotal, previous: previous.houseBillsTotal },
    { key: "shopping", label: "Shopping", current: current.shoppingTotal, previous: previous.shoppingTotal },
    { key: "myBills", label: "My bills", current: current.myBillsTotal, previous: previous.myBillsTotal },
    { key: "adjustments", label: "Adjustments", current: current.adjustmentsTotal, previous: previous.adjustmentsTotal },
    { key: "moneyLeft", label: "Money left", current: current.moneyLeft, previous: previous.moneyLeft },
    { key: "moneyInBank", label: "Money in bank", current: current.moneyInBank, previous: previous.moneyInBank }
  ];

  const deltas: AnalyticsCategoryDelta[] = categories.map((category) => {
    const delta = normalizeCurrency(category.current - category.previous);
    return {
      key: category.key,
      label: category.label,
      currentValue: normalizeCurrency(category.current),
      previousValue: normalizeCurrency(category.previous),
      delta,
      deltaPercent: percentageDelta(category.current, category.previous)
    };
  });

  const driftAlerts = deltas
    .filter((entry) => entry.deltaPercent !== null)
    .filter((entry) => Math.abs(entry.delta) >= 25 && Math.abs(entry.deltaPercent || 0) >= 15)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      delta: entry.delta,
      deltaPercent: entry.deltaPercent || 0
    }))
    .sort((left, right) => Math.abs(right.deltaPercent) - Math.abs(left.deltaPercent))
    .slice(0, 5);

  return {
    month: params.selectedMonth,
    previousMonth: previous.month,
    deltas,
    driftAlerts
  };
}

export function buildPlanningSummary(params: {
  selectedMonth: string;
  snapshots: MonthSnapshot[];
  selectedSnapshot: MonthSnapshot | null;
  cards: CardAccount[];
  selectedMonthlyPayment: MonthlyCardPayments | null;
  selectedProjectionByCardId: Record<string, { closingBalance: number }>;
  income: LineItem[];
  selectedIncomePaydayOverridesByIncomeId: Record<string, number[]>;
  paydayModeSettings?: PaydayModeSettings | null;
  savingsGoals: SavingsGoal[];
}): PlanningSummary {
  const monthPaydaysByIncomeId = resolveIncomePaydaysForMonth({
    month: params.selectedMonth,
    incomeItems: params.income,
    incomePaydayOverridesByIncomeId: params.selectedIncomePaydayOverridesByIncomeId,
    paydayModeSettings: params.paydayModeSettings
  });

  return {
    paydayMode: {
      enabled: params.paydayModeSettings?.enabled === true,
      anchorDate: params.paydayModeSettings?.anchorDate || "",
      cycleDays: params.paydayModeSettings?.cycleDays || 28,
      incomeIds: params.paydayModeSettings?.incomeIds || [],
      monthPaydaysByIncomeId
    },
    savings: buildSavingsProjection({
      selectedMonth: params.selectedMonth,
      selectedSnapshot: params.selectedSnapshot,
      goals: params.savingsGoals
    }),
    debtPayoff: buildDebtPayoffSummary({
      cards: params.cards,
      selectedProjectionByCardId: params.selectedProjectionByCardId,
      selectedMonthlyPayment: params.selectedMonthlyPayment
    }),
    netWorth: buildNetWorthSummary({
      selectedMonth: params.selectedMonth,
      snapshots: params.snapshots,
      selectedSnapshot: params.selectedSnapshot
    }),
    analytics: buildAnalyticsSummary({
      selectedMonth: params.selectedMonth,
      snapshots: params.snapshots,
      selectedSnapshot: params.selectedSnapshot
    })
  };
}

