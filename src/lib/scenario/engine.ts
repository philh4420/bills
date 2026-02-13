import { getDefaultSpendingAccountId } from "@/lib/bank/accounts";
import { normalizeCurrency } from "@/lib/util/numbers";
import { BankAccountProjection } from "@/types";

export interface ScenarioInput {
  month: string;
  extraIncome: number;
  extraExpenses: number;
  extraCardPayments: number;
  accountDeltas: Record<string, number>;
  note?: string;
}

export interface ScenarioResult {
  month: string;
  note?: string;
  input: ScenarioInput;
  base: {
    incomeTotal: number;
    cardSpendTotal: number;
    cardBalanceTotal: number;
    moneyLeft: number;
    moneyInBank: number;
    netWorth: number;
  };
  projected: {
    incomeTotal: number;
    cardSpendTotal: number;
    cardBalanceTotal: number;
    moneyLeft: number;
    moneyInBank: number;
    netWorth: number;
  };
  delta: {
    moneyLeft: number;
    moneyInBank: number;
    cardBalanceTotal: number;
    netWorth: number;
  };
  accountProjection: {
    entries: BankAccountProjection[];
    totalClosingBalance: number;
  };
}

function normalizeInput(input: ScenarioInput): ScenarioInput {
  return {
    month: input.month,
    extraIncome: normalizeCurrency(Number.isFinite(input.extraIncome) ? input.extraIncome : 0),
    extraExpenses: normalizeCurrency(Number.isFinite(input.extraExpenses) ? input.extraExpenses : 0),
    extraCardPayments: normalizeCurrency(
      Math.max(0, Number.isFinite(input.extraCardPayments) ? input.extraCardPayments : 0)
    ),
    accountDeltas: Object.fromEntries(
      Object.entries(input.accountDeltas || {}).map(([accountId, value]) => [
        accountId,
        normalizeCurrency(Number.isFinite(value) ? value : 0)
      ])
    ),
    note: input.note
  };
}

export function evaluateScenario(params: {
  selectedMonth: string;
  snapshot:
    | {
        incomeTotal: number;
        cardSpendTotal: number;
        cardBalanceTotal: number;
        moneyLeft: number;
        moneyInBank: number;
        loanedOutOutstandingTotal: number;
      }
    | null;
  accountProjection?: {
    entries: BankAccountProjection[];
  } | null;
  input: ScenarioInput;
}): ScenarioResult {
  const input = normalizeInput(params.input);
  const snapshot = params.snapshot;
  const baseIncomeTotal = snapshot?.incomeTotal ?? 0;
  const baseCardSpendTotal = snapshot?.cardSpendTotal ?? 0;
  const baseCardBalanceTotal = snapshot?.cardBalanceTotal ?? 0;
  const baseMoneyLeft = snapshot?.moneyLeft ?? 0;
  const baseMoneyInBank = snapshot?.moneyInBank ?? 0;
  const baseLoanedOutOutstanding = snapshot?.loanedOutOutstandingTotal ?? 0;

  const moneyLeftDelta = normalizeCurrency(input.extraIncome - input.extraExpenses - input.extraCardPayments);
  const projectedIncomeTotal = normalizeCurrency(baseIncomeTotal + input.extraIncome);
  const projectedCardSpendTotal = normalizeCurrency(baseCardSpendTotal + input.extraCardPayments);
  const projectedCardBalanceTotal = normalizeCurrency(Math.max(0, baseCardBalanceTotal - input.extraCardPayments));
  const projectedMoneyLeft = normalizeCurrency(baseMoneyLeft + moneyLeftDelta);

  const baseEntries = (params.accountProjection?.entries || []).map((entry) => ({ ...entry }));
  const baseTotalFromAccounts = normalizeCurrency(
    baseEntries.reduce((acc, entry) => acc + entry.closingBalance, 0)
  );
  const fallbackTotal = baseTotalFromAccounts > 0.0001 ? baseTotalFromAccounts : baseMoneyInBank;
  const spendingAccountId = getDefaultSpendingAccountId(
    baseEntries.map((entry) => ({
      id: entry.accountId,
      name: entry.name,
      accountType: entry.accountType,
      includeInNetWorth: entry.includeInNetWorth,
      balance: entry.closingBalance,
      createdAt: "",
      updatedAt: ""
    }))
  );
  const projectedEntries = baseEntries.map((entry) => {
    const accountDelta = input.accountDeltas[entry.accountId] || 0;
    const flowDelta = spendingAccountId && entry.accountId === spendingAccountId ? moneyLeftDelta : 0;
    const closingBalance = normalizeCurrency(entry.closingBalance + accountDelta + flowDelta);
    return {
      ...entry,
      openingBalance: entry.closingBalance,
      closingBalance,
      netChange: normalizeCurrency(closingBalance - entry.closingBalance)
    };
  });

  const manualAccountDeltaTotal = normalizeCurrency(
    Object.values(input.accountDeltas || {}).reduce((acc, value) => acc + value, 0)
  );
  const projectedMoneyInBank = projectedEntries.length
    ? normalizeCurrency(projectedEntries.reduce((acc, entry) => acc + entry.closingBalance, 0))
    : normalizeCurrency(fallbackTotal + moneyLeftDelta + manualAccountDeltaTotal);

  const baseNetWorth = normalizeCurrency(baseMoneyInBank + baseLoanedOutOutstanding - baseCardBalanceTotal);
  const projectedNetWorth = normalizeCurrency(
    projectedMoneyInBank + baseLoanedOutOutstanding - projectedCardBalanceTotal
  );

  const result: ScenarioResult = {
    month: params.selectedMonth,
    note: input.note,
    input,
    base: {
      incomeTotal: normalizeCurrency(baseIncomeTotal),
      cardSpendTotal: normalizeCurrency(baseCardSpendTotal),
      cardBalanceTotal: normalizeCurrency(baseCardBalanceTotal),
      moneyLeft: normalizeCurrency(baseMoneyLeft),
      moneyInBank: normalizeCurrency(baseMoneyInBank),
      netWorth: baseNetWorth
    },
    projected: {
      incomeTotal: projectedIncomeTotal,
      cardSpendTotal: projectedCardSpendTotal,
      cardBalanceTotal: projectedCardBalanceTotal,
      moneyLeft: projectedMoneyLeft,
      moneyInBank: projectedMoneyInBank,
      netWorth: projectedNetWorth
    },
    delta: {
      moneyLeft: normalizeCurrency(projectedMoneyLeft - baseMoneyLeft),
      moneyInBank: normalizeCurrency(projectedMoneyInBank - baseMoneyInBank),
      cardBalanceTotal: normalizeCurrency(projectedCardBalanceTotal - baseCardBalanceTotal),
      netWorth: normalizeCurrency(projectedNetWorth - baseNetWorth)
    },
    accountProjection: {
      entries: projectedEntries,
      totalClosingBalance: normalizeCurrency(
        projectedEntries.reduce((acc, entry) => acc + entry.closingBalance, 0)
      )
    }
  };

  return result;
}
