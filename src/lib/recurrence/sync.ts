import { replaceRecurrenceRules } from "@/lib/firestore/repository";
import { normalizeCurrency } from "@/lib/util/numbers";
import { CardAccount, LineItem, MonthlyAdjustment, RecurrenceRule } from "@/types";

interface RuleInput {
  sourceType: RecurrenceRule["sourceType"];
  sourceId: string;
  label: string;
  kind: RecurrenceRule["kind"];
  amount: number;
  dayOfMonth?: number | null;
  startMonth: string;
  endMonth?: string;
}

function toRule(input: RuleInput, nowIso: string): RecurrenceRule {
  return {
    id: `${input.sourceType}:${input.sourceId}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    label: input.label,
    kind: input.kind,
    frequency: "monthly",
    intervalCount: 1,
    dayOfMonth: input.dayOfMonth ?? 1,
    weekday: null,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    amount: normalizeCurrency(input.amount),
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export function buildDefaultRecurrenceRules(params: {
  cards: CardAccount[];
  houseBills: LineItem[];
  income: LineItem[];
  shopping: LineItem[];
  myBills: LineItem[];
  adjustments: MonthlyAdjustment[];
  startMonth: string;
  nowIso?: string;
}): RecurrenceRule[] {
  const nowIso = params.nowIso || new Date().toISOString();
  const rules: RecurrenceRule[] = [];

  params.cards.forEach((card) => {
    rules.push(
      toRule(
        {
          sourceType: "cardAccount",
          sourceId: card.id,
          label: `${card.name} due day`,
          kind: "card",
          amount: 0,
          dayOfMonth: card.dueDayOfMonth ?? 1,
          startMonth: params.startMonth
        },
        nowIso
      )
    );
  });

  params.houseBills.forEach((item) => {
    rules.push(
      toRule(
        {
          sourceType: "houseBill",
          sourceId: item.id,
          label: item.name,
          kind: "expense",
          amount: -Math.abs(item.amount),
          dayOfMonth: item.dueDayOfMonth ?? 1,
          startMonth: params.startMonth
        },
        nowIso
      )
    );
  });

  params.shopping.forEach((item) => {
    rules.push(
      toRule(
        {
          sourceType: "shoppingItem",
          sourceId: item.id,
          label: item.name,
          kind: "expense",
          amount: -Math.abs(item.amount),
          dayOfMonth: item.dueDayOfMonth ?? 1,
          startMonth: params.startMonth
        },
        nowIso
      )
    );
  });

  params.myBills.forEach((item) => {
    rules.push(
      toRule(
        {
          sourceType: "myBill",
          sourceId: item.id,
          label: item.name,
          kind: "expense",
          amount: -Math.abs(item.amount),
          dayOfMonth: item.dueDayOfMonth ?? 1,
          startMonth: params.startMonth
        },
        nowIso
      )
    );
  });

  params.income.forEach((item) => {
    rules.push(
      toRule(
        {
          sourceType: "incomeItem",
          sourceId: item.id,
          label: item.name,
          kind: "income",
          amount: Math.abs(item.amount),
          dayOfMonth: item.dueDayOfMonth ?? 1,
          startMonth: params.startMonth
        },
        nowIso
      )
    );
  });

  params.adjustments.forEach((adjustment) => {
    const kind: RecurrenceRule["kind"] = adjustment.category === "income" ? "income" : "expense";
    const amount = kind === "income" ? Math.abs(adjustment.amount) : -Math.abs(adjustment.amount);
    rules.push(
      toRule(
        {
          sourceType: "monthlyAdjustment",
          sourceId: adjustment.id,
          label: adjustment.name,
          kind,
          amount,
          dayOfMonth: adjustment.dueDayOfMonth ?? 1,
          startMonth: adjustment.startMonth,
          endMonth: adjustment.endMonth
        },
        nowIso
      )
    );
  });

  return rules.sort((a, b) => a.label.localeCompare(b.label));
}

export async function syncDefaultRecurrenceRules(
  uid: string,
  params: Omit<Parameters<typeof buildDefaultRecurrenceRules>[0], "nowIso">
): Promise<void> {
  const nowIso = new Date().toISOString();
  const rules = buildDefaultRecurrenceRules({ ...params, nowIso }).map((rule) => ({
    ...rule,
    createdAt: nowIso,
    updatedAt: nowIso
  }));
  await replaceRecurrenceRules(uid, rules);
}
