import { normalizeCurrency } from "@/lib/util/numbers";
import { BankAccount, BankAccountProjection, BankTransfer, MonthSnapshot } from "@/types";

function compareMonths(a: string, b: string): number {
  return a.localeCompare(b);
}

function sortTransfers(left: BankTransfer, right: BankTransfer): number {
  if (left.month !== right.month) {
    return left.month.localeCompare(right.month);
  }
  if (left.day !== right.day) {
    return left.day - right.day;
  }
  return left.id.localeCompare(right.id);
}

export function getDefaultSpendingAccountId(accounts: BankAccount[]): string | null {
  if (accounts.length === 0) {
    return null;
  }
  const current = accounts.find((account) => account.accountType === "current");
  return current?.id || accounts[0]?.id || null;
}

export function sumBankAccountBalances(accounts: BankAccount[]): number {
  return normalizeCurrency(
    accounts.reduce((acc, account) => acc + (Number.isFinite(account.balance) ? account.balance : 0), 0)
  );
}

export function buildBankAccountProjectionForMonth(params: {
  month: string;
  accounts: BankAccount[];
  transfers: BankTransfer[];
  snapshots: MonthSnapshot[];
}): {
  month: string;
  entries: BankAccountProjection[];
  totalOpeningBalance: number;
  totalClosingBalance: number;
  netMovementApplied: number;
} {
  const { month, accounts, transfers, snapshots } = params;
  const sortedSnapshots = snapshots.slice().sort((a, b) => a.month.localeCompare(b.month));
  const openingById: Record<string, number> = Object.fromEntries(
    accounts.map((account) => [account.id, normalizeCurrency(account.balance)])
  );
  const balancesById: Record<string, number> = { ...openingById };
  const defaultSpendingAccountId = getDefaultSpendingAccountId(accounts);
  const selectedSnapshot = sortedSnapshots.find((snapshot) => snapshot.month === month) || null;
  const baseTotal = sumBankAccountBalances(accounts);

  let previousMoneyInBank = baseTotal;
  sortedSnapshots.forEach((snapshot) => {
    if (compareMonths(snapshot.month, month) > 0) {
      return;
    }

    const monthMovement = normalizeCurrency(snapshot.moneyInBank - previousMoneyInBank);
    if (defaultSpendingAccountId) {
      balancesById[defaultSpendingAccountId] = normalizeCurrency(
        (balancesById[defaultSpendingAccountId] || 0) + monthMovement
      );
    }
    previousMoneyInBank = snapshot.moneyInBank;

    const monthTransfers = transfers
      .filter((transfer) => transfer.month === snapshot.month)
      .sort(sortTransfers);
    monthTransfers.forEach((transfer) => {
      const amount = normalizeCurrency(Math.max(0, transfer.amount || 0));
      if (amount <= 0.0001) {
        return;
      }
      if (balancesById[transfer.fromAccountId] === undefined || balancesById[transfer.toAccountId] === undefined) {
        return;
      }

      balancesById[transfer.fromAccountId] = normalizeCurrency(
        balancesById[transfer.fromAccountId] - amount
      );
      balancesById[transfer.toAccountId] = normalizeCurrency(
        balancesById[transfer.toAccountId] + amount
      );
    });
  });

  if (!selectedSnapshot && defaultSpendingAccountId) {
    balancesById[defaultSpendingAccountId] = normalizeCurrency(balancesById[defaultSpendingAccountId] || 0);
  }

  const entries: BankAccountProjection[] = accounts.map((account) => {
    const openingBalance = normalizeCurrency(openingById[account.id] || 0);
    const closingBalance = normalizeCurrency(balancesById[account.id] || 0);
    return {
      accountId: account.id,
      name: account.name,
      accountType: account.accountType,
      includeInNetWorth: account.includeInNetWorth !== false,
      openingBalance,
      closingBalance,
      netChange: normalizeCurrency(closingBalance - openingBalance)
    };
  });

  const totalOpeningBalance = normalizeCurrency(
    entries.reduce((acc, entry) => acc + entry.openingBalance, 0)
  );
  const totalClosingBalance = normalizeCurrency(
    entries.reduce((acc, entry) => acc + entry.closingBalance, 0)
  );

  return {
    month,
    entries,
    totalOpeningBalance,
    totalClosingBalance,
    netMovementApplied: normalizeCurrency(totalClosingBalance - totalOpeningBalance)
  };
}

