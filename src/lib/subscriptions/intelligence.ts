import { normalizeCurrency } from "@/lib/util/numbers";
import { LineItem, SubscriptionIntelligenceSummary } from "@/types";

const SWAP_RULES: Array<{
  id: string;
  match: RegExp;
  targetMonthly: number;
  reason: string;
}> = [
  {
    id: "streaming-disney",
    match: /disney|netflix|prime video|amazon prime|paramount|apple tv|now tv/i,
    targetMonthly: 7.99,
    reason: "Rotate streaming services month to month or switch to a lower tier."
  },
  {
    id: "music-subscription",
    match: /spotify|apple music|youtube music|deezer/i,
    targetMonthly: 5.99,
    reason: "Consider family split, student plan, or ad-supported tier."
  },
  {
    id: "phone-broadband",
    match: /broadband|phone|mobile|internet|ee|vodafone|o2|three|sky/i,
    targetMonthly: 29.99,
    reason: "Review annual contract deals and retention offers for telecom services."
  },
  {
    id: "software-tools",
    match: /adobe|figma|canva|paddle|web|hosting|domain/i,
    targetMonthly: 9.99,
    reason: "Audit seat count and annual vs monthly billing for software subscriptions."
  }
];

function toRankedEntries(params: {
  houseBills: Array<Pick<LineItem, "id" | "name" | "amount">>;
  myBills: Array<Pick<LineItem, "id" | "name" | "amount">>;
  shopping: Array<Pick<LineItem, "id" | "name" | "amount">>;
}): SubscriptionIntelligenceSummary["ranked"] {
  const raw = [
    ...params.houseBills.map((item) => ({
      id: `houseBills:${item.id}`,
      sourceCollection: "houseBills" as const,
      name: item.name,
      monthlyAmount: normalizeCurrency(Math.max(0, item.amount))
    })),
    ...params.myBills.map((item) => ({
      id: `myBills:${item.id}`,
      sourceCollection: "myBills" as const,
      name: item.name,
      monthlyAmount: normalizeCurrency(Math.max(0, item.amount))
    })),
    ...params.shopping.map((item) => ({
      id: `shoppingItems:${item.id}`,
      sourceCollection: "shoppingItems" as const,
      name: item.name,
      monthlyAmount: normalizeCurrency(Math.max(0, item.amount))
    }))
  ]
    .filter((entry) => entry.name.trim().length > 0)
    .filter((entry) => entry.monthlyAmount > 0.0001)
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount || a.name.localeCompare(b.name))
    .slice(0, 20);

  return raw.map((entry, index) => ({
    ...entry,
    annualAmount: normalizeCurrency(entry.monthlyAmount * 12),
    rank: index + 1
  }));
}

function toSwapSuggestions(
  ranked: SubscriptionIntelligenceSummary["ranked"]
): SubscriptionIntelligenceSummary["suggestions"] {
  const suggestions = ranked
    .map((entry) => {
      const matchedRule = SWAP_RULES.find((rule) => rule.match.test(entry.name));
      const targetMonthly = matchedRule
        ? Math.min(entry.monthlyAmount, matchedRule.targetMonthly)
        : Math.min(entry.monthlyAmount, entry.monthlyAmount * 0.85);
      const monthlySavings = normalizeCurrency(Math.max(0, entry.monthlyAmount - targetMonthly));
      if (monthlySavings < 1) {
        return null;
      }

      return {
        id: `${entry.id}:${matchedRule?.id || "generic"}`,
        name: entry.name,
        currentMonthly: entry.monthlyAmount,
        suggestedMonthly: normalizeCurrency(targetMonthly),
        potentialMonthlySavings: monthlySavings,
        potentialAnnualSavings: normalizeCurrency(monthlySavings * 12),
        reason:
          matchedRule?.reason ||
          "Compare alternatives and negotiate renewal to reduce this recurring cost."
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.potentialAnnualSavings - a.potentialAnnualSavings)
    .slice(0, 8);

  return suggestions;
}

export function buildSubscriptionIntelligence(params: {
  month: string;
  houseBills: Array<Pick<LineItem, "id" | "name" | "amount">>;
  myBills: Array<Pick<LineItem, "id" | "name" | "amount">>;
  shopping: Array<Pick<LineItem, "id" | "name" | "amount">>;
}): SubscriptionIntelligenceSummary {
  const ranked = toRankedEntries(params);
  const suggestions = toSwapSuggestions(ranked);
  return {
    month: params.month,
    ranked,
    suggestions
  };
}

