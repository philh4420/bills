"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { MobileEditDrawer } from "@/components/mobile-edit-drawer";
import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP, formatMonthKeyUK } from "@/lib/util/format";

interface Item {
  id: string;
  name: string;
  amount: number;
  dueDayOfMonth?: number | null;
}

interface MonthlyAdjustment {
  id: string;
  name: string;
  amount: number;
  category: "income" | "houseBills" | "shopping" | "myBills";
  sourceType?: "loan" | "bonus" | "other";
  startMonth: string;
  endMonth?: string;
  dueDayOfMonth?: number | null;
}

interface LoanedOutItem {
  id: string;
  name: string;
  amount: number;
  startMonth: string;
  status: "outstanding" | "paidBack";
  paidBackMonth?: string;
}

interface BankBalanceRecord {
  id: string;
  amount: number;
}

interface IncomePaydaysData {
  months: string[];
  selectedMonth: string;
  incomes: Array<{
    id: string;
    name: string;
    amount: number;
    defaultPayDay: number;
  }>;
  byIncomeId: Record<string, number[]>;
  hasOverrides: boolean;
}

const DUE_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const INCOME_SOURCE_OPTIONS = [
  { value: "loan", label: "Loan" },
  { value: "bonus", label: "Bonus" },
  { value: "other", label: "Other" }
] as const;
const LOAN_STATUS_OPTIONS = [
  { value: "outstanding", label: "Outstanding" },
  { value: "paidBack", label: "Paid back" }
] as const;

function formatIncomeSourceLabel(sourceType?: "loan" | "bonus" | "other"): string {
  if (sourceType === "loan") {
    return "Loan";
  }
  if (sourceType === "bonus") {
    return "Bonus";
  }
  return "Other";
}

function formatLoanStatusLabel(status: "outstanding" | "paidBack"): string {
  return status === "paidBack" ? "Paid back" : "Outstanding";
}

function parseDueDayInput(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }
  return parsed;
}

function parsePaydayListInput(value: string): number[] | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const tokens = normalized
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const days = tokens.map((token) => Number.parseInt(token, 10));
  if (
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 31)
  ) {
    return null;
  }

  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function formatPaydayList(days: number[]): string {
  return days.join(", ");
}

function dayListsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function normalizeMonthInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const year = match[1];
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function LineItemCollection({
  title,
  subtitle,
  endpoint,
  getIdToken
}: {
  title: string;
  subtitle: string;
  endpoint: "/api/house-bills" | "/api/income" | "/api/shopping" | "/api/my-bills";
  getIdToken: () => Promise<string | null>;
}) {
  const supportsDueDay = true;
  const dueDayLabel = endpoint === "/api/income" ? "Pay day" : "Due day";
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("0");
  const [newDueDay, setNewDueDay] = useState("1");
  const [drafts, setDrafts] = useState<Record<string, Item>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [mobileEditId, setMobileEditId] = useState<string | null>(null);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);

  const query = useQuery({
    queryKey: [endpoint],
    queryFn: () => authedRequest<{ items: Item[] }>(getIdToken, endpoint)
  });

  useEffect(() => {
    const next: Record<string, Item> = {};
    (query.data?.items || []).forEach((item) => {
      next[item.id] = {
        ...item,
        dueDayOfMonth: supportsDueDay ? (item.dueDayOfMonth ?? 1) : null
      };
    });
    setDrafts(next);
  }, [query.data, supportsDueDay]);

  const items = query.data?.items || [];
  const total = items.reduce((acc, item) => acc + item.amount, 0);

  function getItemDraft(item: Item): Item {
    return (
      drafts[item.id] || {
        ...item,
        dueDayOfMonth: supportsDueDay ? (item.dueDayOfMonth ?? 1) : null
      }
    );
  }

  const mobileItem = mobileEditId ? items.find((entry) => entry.id === mobileEditId) || null : null;
  const mobileDraft = mobileItem ? getItemDraft(mobileItem) : null;

  async function addItem() {
    if (!newName.trim()) {
      return;
    }

    setMessage(null);
    const dueDay = supportsDueDay ? parseDueDayInput(newDueDay) : null;
    await authedRequest(getIdToken, endpoint, {
      method: "POST",
      body: JSON.stringify({
        name: newName.trim(),
        amount: Number(newAmount),
        dueDayOfMonth: supportsDueDay ? dueDay : undefined
      })
    });
    setNewName("");
    setNewAmount("0");
    setNewDueDay("1");
    setMessage("Created item");
    await query.refetch();
  }

  async function saveItem(id: string) {
    const item = drafts[id];
    if (!item) {
      return;
    }

    setMessage(null);
    await authedRequest(getIdToken, `${endpoint}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: item.name,
        amount: item.amount,
        dueDayOfMonth: supportsDueDay ? (item.dueDayOfMonth ?? null) : undefined
      })
    });
    setMessage("Saved item");
    await query.refetch();
  }

  async function deleteItem(id: string) {
    setMessage(null);
    await authedRequest(getIdToken, `${endpoint}/${id}`, {
      method: "DELETE"
    });
    setMessage("Deleted item");
    await query.refetch();
  }

  return (
    <SectionPanel
      title={title}
      subtitle={subtitle}
      right={<p className="text-sm text-[var(--ink-soft)]">Total: {formatGBP(total)}</p>}
    >
      {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
      {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

      <div className="space-y-3 xl:hidden">
        {items.map((item) => {
          const draft = getItemDraft(item);
          const dueLabel = supportsDueDay ? String(draft.dueDayOfMonth ?? "Not set") : null;
          return (
            <div className="mobile-edit-card" key={`mobile-${item.id}`}>
              <div className="mobile-edit-card-head">
                <div className="min-w-0">
                  <p className="mobile-edit-card-title">{draft.name}</p>
                  <p className="mobile-edit-card-subtitle">Monthly value: {formatGBP(draft.amount)}</p>
                </div>
                <button className="button-secondary shrink-0" type="button" onClick={() => setMobileEditId(item.id)}>
                  Edit
                </button>
              </div>
              <div className="mobile-edit-keyvals">
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Amount</span>
                  <span className="mobile-edit-keyval-value">{formatGBP(draft.amount)}</span>
                </div>
                {supportsDueDay ? (
                  <div className="mobile-edit-keyval">
                    <span className="mobile-edit-keyval-label">{dueDayLabel}</span>
                    <span className="mobile-edit-keyval-value">{dueLabel}</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <button className="button-primary w-full" type="button" onClick={() => setMobileAddOpen(true)}>
          Add item
        </button>

        <MobileEditDrawer
          open={Boolean(mobileItem && mobileDraft)}
          title={mobileItem ? `Edit ${mobileItem.name}` : "Edit item"}
          subtitle="Update this monthly entry."
          onClose={() => setMobileEditId(null)}
          footer={
            <div className="flex flex-col gap-2">
              {mobileItem ? (
                <button
                  className="button-danger w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    await deleteItem(mobileItem.id);
                    setMobileEditId(null);
                  }}
                >
                  Delete
                </button>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileEditId(null)}>
                  Cancel
                </button>
                <button
                  className="button-primary w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    if (!mobileItem) {
                      return;
                    }
                    await saveItem(mobileItem.id);
                    setMobileEditId(null);
                  }}
                >
                  Save item
                </button>
              </div>
            </div>
          }
        >
          {mobileItem && mobileDraft ? (
            <div className="grid gap-3">
              <div>
                <p className="label">Name</p>
                <input
                  className="input mt-1"
                  value={mobileDraft.name}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: {
                        ...mobileDraft,
                        name: event.target.value
                      }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Amount</p>
                <input
                  className="input mt-1"
                  type="number"
                  step="0.01"
                  value={mobileDraft.amount}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: {
                        ...mobileDraft,
                        amount: Number(event.target.value)
                      }
                    }))
                  }
                />
              </div>
              {supportsDueDay ? (
                <div>
                  <p className="label">{dueDayLabel}</p>
                  <select
                    className="input mt-1"
                    value={mobileDraft.dueDayOfMonth ? String(mobileDraft.dueDayOfMonth) : ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [mobileItem.id]: {
                          ...mobileDraft,
                          dueDayOfMonth: parseDueDayInput(event.target.value)
                        }
                      }))
                    }
                  >
                    <option value="">Not set</option>
                    {DUE_DAY_OPTIONS.map((day) => (
                      <option key={`drawer-line-due-${mobileItem.id}-${day}`} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}
        </MobileEditDrawer>

        <MobileEditDrawer
          open={mobileAddOpen}
          title={`Add ${title}`}
          subtitle="Create a new monthly entry."
          onClose={() => setMobileAddOpen(false)}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileAddOpen(false)}>
                Cancel
              </button>
              <button
                className="button-primary w-full sm:w-auto"
                type="button"
                onClick={async () => {
                  if (!newName.trim()) {
                    return;
                  }
                  await addItem();
                  setMobileAddOpen(false);
                }}
              >
                Add item
              </button>
            </div>
          }
        >
          <div className="grid gap-3">
            <div>
              <p className="label">Name</p>
              <input
                className="input mt-1"
                placeholder="New item"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div>
              <p className="label">Amount</p>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(event) => setNewAmount(event.target.value)}
              />
            </div>
            {supportsDueDay ? (
              <div>
                <p className="label">{dueDayLabel}</p>
                <select className="input mt-1" value={newDueDay} onChange={(event) => setNewDueDay(event.target.value)}>
                  <option value="">{dueDayLabel}</option>
                  {DUE_DAY_OPTIONS.map((day) => (
                    <option key={`new-line-due-${endpoint}-${day}`} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </MobileEditDrawer>
      </div>

      <div className="table-wrap hidden xl:block">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
              {supportsDueDay ? <th>{dueDayLabel}</th> : null}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className="input"
                    value={drafts[item.id]?.name || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...prev[item.id],
                          name: event.target.value
                        }
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={drafts[item.id]?.amount ?? 0}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...prev[item.id],
                          amount: Number(event.target.value)
                        }
                      }))
                    }
                  />
                </td>
                {supportsDueDay ? (
                  <td>
                    <select
                      className="input"
                      value={drafts[item.id]?.dueDayOfMonth ? String(drafts[item.id]?.dueDayOfMonth) : ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...prev[item.id],
                            dueDayOfMonth: parseDueDayInput(event.target.value)
                          }
                        }))
                      }
                    >
                      <option value="">Not set</option>
                      {DUE_DAY_OPTIONS.map((day) => (
                        <option key={`desktop-line-due-${item.id}-${day}`} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : null}
                <td>
                  <div className="flex gap-2">
                    <button className="button-secondary" type="button" onClick={() => saveItem(item.id)}>
                      Save
                    </button>
                    <button className="button-danger" type="button" onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            <tr>
              <td>
                <input
                  className="input"
                  placeholder="New item"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={newAmount}
                  onChange={(event) => setNewAmount(event.target.value)}
                />
              </td>
              {supportsDueDay ? (
                <td>
                  <select className="input" value={newDueDay} onChange={(event) => setNewDueDay(event.target.value)}>
                    <option value="">{dueDayLabel}</option>
                    {DUE_DAY_OPTIONS.map((day) => (
                      <option key={`desktop-new-line-due-${endpoint}-${day}`} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </td>
              ) : null}
              <td>
                <button className="button-primary" type="button" onClick={() => addItem()}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-2 text-sm text-[var(--accent-strong)]">{message}</p> : null}
    </SectionPanel>
  );
}

function MonthlyIncomePaydaysCollection({ getIdToken }: { getIdToken: () => Promise<string | null> }) {
  const [month, setMonth] = useState<string>("");
  const [draftTextByIncomeId, setDraftTextByIncomeId] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["income-paydays", month],
    queryFn: () =>
      authedRequest<IncomePaydaysData>(
        getIdToken,
        `/api/income-paydays${month ? `?month=${encodeURIComponent(month)}` : ""}`
      )
  });

  useEffect(() => {
    if (!month && query.data?.selectedMonth) {
      setMonth(query.data.selectedMonth);
    }
  }, [month, query.data?.selectedMonth]);

  useEffect(() => {
    if (!query.data?.byIncomeId) {
      return;
    }
    setDraftTextByIncomeId(
      Object.fromEntries(
        Object.entries(query.data.byIncomeId).map(([incomeId, days]) => [incomeId, formatPaydayList(days)])
      )
    );
  }, [query.data?.byIncomeId]);

  const incomes = query.data?.incomes || [];
  const selectedMonth = month || query.data?.selectedMonth || "";
  const monthOptions = query.data?.months?.length
    ? query.data.months
    : selectedMonth
      ? [selectedMonth]
      : [];
  const customCount = incomes.reduce((acc, income) => {
    const parsed = parsePaydayListInput(draftTextByIncomeId[income.id] || "");
    const currentDays = parsed && parsed.length > 0 ? parsed : [income.defaultPayDay];
    return acc + (dayListsEqual(currentDays, [income.defaultPayDay]) ? 0 : 1);
  }, 0);

  async function saveMonthPaydays() {
    if (!selectedMonth) {
      return;
    }

    const payload: Record<string, number[] | null> = {};
    for (const income of incomes) {
      const parsed = parsePaydayListInput(draftTextByIncomeId[income.id] || "");
      if (!parsed || parsed.length === 0) {
        setMessage(`Invalid pay days for ${income.name}. Use values 1-31, for example: 2, 30.`);
        return;
      }

      payload[income.id] = dayListsEqual(parsed, [income.defaultPayDay]) ? null : parsed;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/income-paydays/${selectedMonth}`, {
        method: "PUT",
        body: JSON.stringify({ byIncomeId: payload })
      });
      setMessage(`Saved income paydays for ${formatMonthKeyUK(selectedMonth)}`);
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save income paydays");
    }
  }

  return (
    <SectionPanel
      title="Monthly Income Paydays"
      subtitle="Override pay days per month for 4-week cycles without creating a second income item. Use comma-separated days like 2, 30."
      right={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            className="input w-full sm:min-w-[140px] sm:w-auto"
            value={selectedMonth}
            onChange={(event) => setMonth(event.target.value)}
          >
            {monthOptions.map((entry) => (
              <option key={`income-payday-month-${entry}`} value={entry}>
                {formatMonthKeyUK(entry)}
              </option>
            ))}
          </select>
          <button className="button-primary w-full sm:w-auto" type="button" onClick={() => saveMonthPaydays()}>
            Save month
          </button>
        </div>
      }
    >
      {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
      {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

      <div className="space-y-3 xl:hidden">
        {incomes.map((income) => {
          const payDayText = draftTextByIncomeId[income.id] || String(income.defaultPayDay);
          return (
            <div className="mobile-edit-card" key={`income-payday-mobile-${income.id}`}>
              <div className="mobile-edit-card-head">
                <div className="min-w-0">
                  <p className="mobile-edit-card-title">{income.name}</p>
                  <p className="mobile-edit-card-subtitle">Monthly value: {formatGBP(income.amount)}</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="label">Pay days</p>
                <input
                  className="input mt-1"
                  value={payDayText}
                  onChange={(event) =>
                    setDraftTextByIncomeId((prev) => ({
                      ...prev,
                      [income.id]: event.target.value
                    }))
                  }
                  placeholder={`e.g. ${income.defaultPayDay} or 2, 30`}
                />
                <p className="mt-1 text-xs text-[var(--ink-soft)]">Default: {income.defaultPayDay}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="table-wrap hidden xl:block">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
              <th>Pay days</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            {incomes.map((income) => {
              const payDayText = draftTextByIncomeId[income.id] || String(income.defaultPayDay);
              return (
                <tr key={`income-payday-row-${income.id}`}>
                  <td>{income.name}</td>
                  <td>{formatGBP(income.amount)}</td>
                  <td>
                    <input
                      className="input"
                      value={payDayText}
                      onChange={(event) =>
                        setDraftTextByIncomeId((prev) => ({
                          ...prev,
                          [income.id]: event.target.value
                        }))
                      }
                      placeholder={`e.g. ${income.defaultPayDay} or 2, 30`}
                    />
                  </td>
                  <td>{income.defaultPayDay}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Custom month overrides: {customCount}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Enter one or more pay days (1-31), comma-separated. Example: <code>2, 30</code>.
      </p>
      {message ? <p className="mt-1 text-sm text-[var(--accent-strong)]">{message}</p> : null}
    </SectionPanel>
  );
}

function ExtraIncomeCollection({ getIdToken }: { getIdToken: () => Promise<string | null> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MonthlyAdjustment>>({});
  const [mobileEditId, setMobileEditId] = useState<string | null>(null);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    sourceType: "loan" as "loan" | "bonus" | "other",
    amount: "0",
    startMonth: "2026-01",
    endMonth: ""
  });

  const query = useQuery({
    queryKey: ["monthly-adjustments"],
    queryFn: () =>
      authedRequest<{ adjustments: MonthlyAdjustment[] }>(getIdToken, "/api/monthly-adjustments")
  });

  useEffect(() => {
    const next: Record<string, MonthlyAdjustment> = {};
    (query.data?.adjustments || [])
      .filter((item) => item.category === "income")
      .forEach((item) => {
        next[item.id] = {
          ...item,
          sourceType: item.sourceType ?? "other"
        };
      });
    setDrafts(next);
  }, [query.data]);

  const extraIncomeItems = (query.data?.adjustments || []).filter((item) => item.category === "income");
  const total = extraIncomeItems.reduce((acc, item) => acc + item.amount, 0);

  function getIncomeDraft(item: MonthlyAdjustment): MonthlyAdjustment {
    return (
      drafts[item.id] || {
        ...item,
        sourceType: item.sourceType ?? "other"
      }
    );
  }

  function rangeLabel(startMonth: string, endMonth?: string): string {
    if (!endMonth) {
      return `${startMonth} onward`;
    }
    if (endMonth === startMonth) {
      return `One-off ${startMonth}`;
    }
    return `${startMonth} to ${endMonth}`;
  }

  const mobileItem = mobileEditId
    ? extraIncomeItems.find((entry) => entry.id === mobileEditId) || null
    : null;
  const mobileDraft = mobileItem ? getIncomeDraft(mobileItem) : null;

  async function createItem(): Promise<boolean> {
    if (!newItem.name.trim()) {
      setMessage("Name is required.");
      return false;
    }

    const startMonth = normalizeMonthInput(newItem.startMonth);
    if (!startMonth) {
      setMessage("Start month must be in YYYY-MM format.");
      return false;
    }

    const endMonth = newItem.endMonth ? normalizeMonthInput(newItem.endMonth) : null;
    if (newItem.endMonth && !endMonth) {
      setMessage("End month must be in YYYY-MM format.");
      return false;
    }

    if (endMonth && endMonth < startMonth) {
      setMessage("End month must be greater than or equal to start month.");
      return false;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, "/api/monthly-adjustments", {
        method: "POST",
        body: JSON.stringify({
          name: newItem.name.trim(),
          amount: Number(newItem.amount),
          category: "income",
          sourceType: newItem.sourceType,
          startMonth,
          endMonth: endMonth || undefined,
          dueDayOfMonth: null
        })
      });

      setNewItem({
        name: "",
        sourceType: "loan",
        amount: "0",
        startMonth: "2026-01",
        endMonth: ""
      });
      setMessage("Created extra income entry");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create extra income");
      return false;
    }
  }

  async function saveItem(id: string): Promise<boolean> {
    const item = drafts[id];
    if (!item) {
      return false;
    }

    const startMonth = normalizeMonthInput(item.startMonth);
    if (!startMonth) {
      setMessage("Start month must be in YYYY-MM format.");
      return false;
    }

    const endMonth = item.endMonth ? normalizeMonthInput(item.endMonth) : null;
    if (item.endMonth && !endMonth) {
      setMessage("End month must be in YYYY-MM format.");
      return false;
    }

    if (endMonth && endMonth < startMonth) {
      setMessage("End month must be greater than or equal to start month.");
      return false;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/monthly-adjustments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: item.name,
          amount: item.amount,
          category: "income",
          sourceType: item.sourceType ?? "other",
          startMonth,
          endMonth: endMonth || null,
          dueDayOfMonth: null
        })
      });
      setMessage("Saved extra income entry");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save extra income");
      return false;
    }
  }

  async function deleteItem(id: string): Promise<boolean> {
    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/monthly-adjustments/${id}`, {
        method: "DELETE"
      });
      setMessage("Deleted extra income entry");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete extra income");
      return false;
    }
  }

  return (
    <SectionPanel
      title="Extra Income"
      subtitle="Add additional income such as loans, bonuses, refunds, or one-off cash boosts by month."
      right={<p className="text-sm text-[var(--ink-soft)]">Active Total: {formatGBP(total)}</p>}
    >
      {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
      {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

      <div className="space-y-3 xl:hidden">
        {extraIncomeItems.map((item) => {
          const draft = getIncomeDraft(item);
          return (
            <div className="mobile-edit-card" key={`mobile-extra-income-${item.id}`}>
              <div className="mobile-edit-card-head">
                <div className="min-w-0">
                  <p className="mobile-edit-card-title">{draft.name}</p>
                  <p className="mobile-edit-card-subtitle">{rangeLabel(draft.startMonth, draft.endMonth)}</p>
                </div>
                <button className="button-secondary shrink-0" type="button" onClick={() => setMobileEditId(item.id)}>
                  Edit
                </button>
              </div>
              <div className="mobile-edit-keyvals">
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Type</span>
                  <span className="mobile-edit-keyval-value">{formatIncomeSourceLabel(draft.sourceType)}</span>
                </div>
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Amount</span>
                  <span className="mobile-edit-keyval-value">{formatGBP(draft.amount)}</span>
                </div>
              </div>
            </div>
          );
        })}

        <button className="button-primary w-full" type="button" onClick={() => setMobileAddOpen(true)}>
          Add extra income
        </button>

        <MobileEditDrawer
          open={Boolean(mobileItem && mobileDraft)}
          title={mobileItem ? `Edit ${mobileItem.name}` : "Edit extra income"}
          subtitle="Update amount and month range."
          onClose={() => setMobileEditId(null)}
          footer={
            <div className="flex flex-col gap-2">
              {mobileItem ? (
                <button
                  className="button-danger w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    const deleted = await deleteItem(mobileItem.id);
                    if (deleted) {
                      setMobileEditId(null);
                    }
                  }}
                >
                  Delete
                </button>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileEditId(null)}>
                  Cancel
                </button>
                <button
                  className="button-primary w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    if (!mobileItem) {
                      return;
                    }
                    const saved = await saveItem(mobileItem.id);
                    if (saved) {
                      setMobileEditId(null);
                    }
                  }}
                >
                  Save income
                </button>
              </div>
            </div>
          }
        >
          {mobileItem && mobileDraft ? (
            <div className="grid gap-3">
              <div>
                <p className="label">Name</p>
                <input
                  className="input mt-1"
                  value={mobileDraft.name}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, name: event.target.value }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Type</p>
                <select
                  className="input mt-1"
                  value={mobileDraft.sourceType ?? "other"}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: {
                        ...mobileDraft,
                        sourceType: event.target.value as MonthlyAdjustment["sourceType"]
                      }
                    }))
                  }
                >
                  {INCOME_SOURCE_OPTIONS.map((option) => (
                    <option key={`mobile-income-source-${mobileItem.id}-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="label">Amount</p>
                <input
                  className="input mt-1"
                  type="number"
                  step="0.01"
                  value={mobileDraft.amount}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, amount: Number(event.target.value) }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Start month</p>
                <input
                  className="input mt-1"
                  type="month"
                  value={mobileDraft.startMonth}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, startMonth: event.target.value }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">End month (optional)</p>
                <input
                  className="input mt-1"
                  type="month"
                  value={mobileDraft.endMonth || ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, endMonth: event.target.value }
                    }))
                  }
                />
              </div>
              <p className="text-xs text-[var(--ink-soft)]">For one-off income, set end month equal to start month.</p>
            </div>
          ) : null}
        </MobileEditDrawer>

        <MobileEditDrawer
          open={mobileAddOpen}
          title="Add extra income"
          subtitle="Example: loan in March, bonus in June, refund in August."
          onClose={() => setMobileAddOpen(false)}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileAddOpen(false)}>
                Cancel
              </button>
              <button
                className="button-primary w-full sm:w-auto"
                type="button"
                onClick={async () => {
                  const created = await createItem();
                  if (created) {
                    setMobileAddOpen(false);
                  }
                }}
              >
                Add extra income
              </button>
            </div>
          }
        >
          <div className="grid gap-3">
            <div>
              <p className="label">Name</p>
              <input
                className="input mt-1"
                placeholder="Loan from family"
                value={newItem.name}
                onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Type</p>
              <select
                className="input mt-1"
                value={newItem.sourceType}
                onChange={(event) =>
                  setNewItem((prev) => ({
                    ...prev,
                    sourceType: event.target.value as "loan" | "bonus" | "other"
                  }))
                }
              >
                {INCOME_SOURCE_OPTIONS.map((option) => (
                  <option key={`new-income-source-mobile-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="label">Amount</p>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={newItem.amount}
                onChange={(event) => setNewItem((prev) => ({ ...prev, amount: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Start month</p>
              <input
                className="input mt-1"
                type="month"
                value={newItem.startMonth}
                onChange={(event) => setNewItem((prev) => ({ ...prev, startMonth: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">End month (optional)</p>
              <input
                className="input mt-1"
                type="month"
                value={newItem.endMonth}
                onChange={(event) => setNewItem((prev) => ({ ...prev, endMonth: event.target.value }))}
              />
            </div>
            <p className="text-xs text-[var(--ink-soft)]">Set end month = start month for one-off.</p>
          </div>
        </MobileEditDrawer>
      </div>

      <div className="table-wrap hidden xl:block">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Start</th>
              <th>End</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {extraIncomeItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className="input"
                    value={drafts[item.id]?.name || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], name: event.target.value }
                      }))
                    }
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={drafts[item.id]?.sourceType || "other"}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...prev[item.id],
                          sourceType: event.target.value as MonthlyAdjustment["sourceType"]
                        }
                      }))
                    }
                  >
                    {INCOME_SOURCE_OPTIONS.map((option) => (
                      <option key={`desktop-income-source-${item.id}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={drafts[item.id]?.amount ?? 0}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], amount: Number(event.target.value) }
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="month"
                    value={drafts[item.id]?.startMonth || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], startMonth: event.target.value }
                      }))
                    }
                    placeholder="YYYY-MM"
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="month"
                    value={drafts[item.id]?.endMonth || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], endMonth: event.target.value }
                      }))
                    }
                    placeholder="YYYY-MM"
                  />
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="button-secondary" type="button" onClick={() => saveItem(item.id)}>
                      Save
                    </button>
                    <button className="button-danger" type="button" onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            <tr>
              <td>
                <input
                  className="input"
                  value={newItem.name}
                  placeholder="Loan from family"
                  onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                />
              </td>
              <td>
                <select
                  className="input"
                  value={newItem.sourceType}
                  onChange={(event) =>
                    setNewItem((prev) => ({
                      ...prev,
                      sourceType: event.target.value as "loan" | "bonus" | "other"
                    }))
                  }
                >
                  {INCOME_SOURCE_OPTIONS.map((option) => (
                    <option key={`desktop-new-income-source-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={newItem.amount}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, amount: event.target.value }))}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="month"
                  value={newItem.startMonth}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, startMonth: event.target.value }))}
                  placeholder="YYYY-MM"
                />
              </td>
              <td>
                <input
                  className="input"
                  type="month"
                  value={newItem.endMonth}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, endMonth: event.target.value }))}
                  placeholder="YYYY-MM"
                />
              </td>
              <td>
                <button className="button-primary" type="button" onClick={() => createItem()}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-2 text-sm text-[var(--accent-strong)]">{message}</p> : null}
    </SectionPanel>
  );
}

function BankBalanceSection({ getIdToken }: { getIdToken: () => Promise<string | null> }) {
  const [amountDraft, setAmountDraft] = useState("0");
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["bank-balance"],
    queryFn: () => authedRequest<{ bankBalance: BankBalanceRecord | null }>(getIdToken, "/api/bank-balance")
  });

  useEffect(() => {
    const amount = query.data?.bankBalance?.amount ?? 0;
    setAmountDraft(String(amount));
  }, [query.data?.bankBalance?.amount]);

  async function saveBankBalance() {
    const amount = Number.parseFloat(amountDraft);
    if (!Number.isFinite(amount)) {
      setMessage("Amount must be a valid number.");
      return;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, "/api/bank-balance", {
        method: "PUT",
        body: JSON.stringify({
          amount
        })
      });
      setMessage("Saved bank balance");
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save bank balance");
    }
  }

  const parsedDraftAmount = Number.parseFloat(amountDraft);
  const currentDisplayAmount =
    query.data?.bankBalance?.amount ?? (Number.isFinite(parsedDraftAmount) ? parsedDraftAmount : 0);

  return (
    <SectionPanel
      title="Money In Bank"
      subtitle="Set your current bank amount. Dashboard money-in-bank uses this as the base balance."
      right={
        <p className="text-sm text-[var(--ink-soft)]">
          Current: {formatGBP(currentDisplayAmount)}
        </p>
      }
    >
      {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
      {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="label">Bank balance (GBP)</span>
          <input
            className="input mt-1"
            type="number"
            step="0.01"
            value={amountDraft}
            onChange={(event) => setAmountDraft(event.target.value)}
          />
        </label>
        <button className="button-primary w-full sm:w-auto" type="button" onClick={() => saveBankBalance()}>
          Save balance
        </button>
      </div>

      {message ? <p className="mt-2 text-sm text-[var(--accent-strong)]">{message}</p> : null}
    </SectionPanel>
  );
}

function LoanedOutCollection({ getIdToken }: { getIdToken: () => Promise<string | null> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LoanedOutItem>>({});
  const [mobileEditId, setMobileEditId] = useState<string | null>(null);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    amount: "0",
    startMonth: "2026-01",
    status: "outstanding" as "outstanding" | "paidBack",
    paidBackMonth: ""
  });

  const query = useQuery({
    queryKey: ["loaned-out"],
    queryFn: () => authedRequest<{ items: LoanedOutItem[] }>(getIdToken, "/api/loaned-out")
  });

  useEffect(() => {
    const next: Record<string, LoanedOutItem> = {};
    (query.data?.items || []).forEach((item) => {
      next[item.id] = {
        ...item,
        paidBackMonth: item.paidBackMonth || undefined
      };
    });
    setDrafts(next);
  }, [query.data]);

  const items = query.data?.items || [];
  const totalOutstanding = items
    .filter((item) => item.status === "outstanding")
    .reduce((acc, item) => acc + item.amount, 0);
  const totalPaidBack = items
    .filter((item) => item.status === "paidBack")
    .reduce((acc, item) => acc + item.amount, 0);

  function getDraft(item: LoanedOutItem): LoanedOutItem {
    return drafts[item.id] || { ...item, paidBackMonth: item.paidBackMonth || undefined };
  }

  function validateLoanMonths(input: {
    startMonth: string;
    status: "outstanding" | "paidBack";
    paidBackMonth?: string;
  }): { ok: true; startMonth: string; paidBackMonth?: string } | { ok: false; message: string } {
    const startMonth = normalizeMonthInput(input.startMonth);
    if (!startMonth) {
      return { ok: false, message: "Start month must be in YYYY-MM format." };
    }

    const normalizedPaidBack = input.paidBackMonth ? normalizeMonthInput(input.paidBackMonth) : null;
    if (input.paidBackMonth && !normalizedPaidBack) {
      return { ok: false, message: "Paid-back month must be in YYYY-MM format." };
    }

    if (input.status === "paidBack" && !normalizedPaidBack) {
      return { ok: false, message: "Paid-back month is required when status is paid back." };
    }

    if (normalizedPaidBack && normalizedPaidBack < startMonth) {
      return { ok: false, message: "Paid-back month must be greater than or equal to start month." };
    }

    return {
      ok: true,
      startMonth,
      paidBackMonth: input.status === "paidBack" ? normalizedPaidBack || undefined : undefined
    };
  }

  const mobileItem = mobileEditId ? items.find((entry) => entry.id === mobileEditId) || null : null;
  const mobileDraft = mobileItem ? getDraft(mobileItem) : null;

  async function createItem(): Promise<boolean> {
    if (!newItem.name.trim()) {
      setMessage("Name is required.");
      return false;
    }

    const parsedAmount = Number.parseFloat(newItem.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Amount must be greater than 0.");
      return false;
    }

    const validated = validateLoanMonths({
      startMonth: newItem.startMonth,
      status: newItem.status,
      paidBackMonth: newItem.paidBackMonth || undefined
    });
    if (!validated.ok) {
      setMessage(validated.message);
      return false;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, "/api/loaned-out", {
        method: "POST",
        body: JSON.stringify({
          name: newItem.name.trim(),
          amount: parsedAmount,
          startMonth: validated.startMonth,
          status: newItem.status,
          paidBackMonth: validated.paidBackMonth
        })
      });
      setNewItem({
        name: "",
        amount: "0",
        startMonth: "2026-01",
        status: "outstanding",
        paidBackMonth: ""
      });
      setMessage("Created loaned-out entry");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create loaned-out entry");
      return false;
    }
  }

  async function saveItem(id: string): Promise<boolean> {
    const draft = drafts[id];
    if (!draft) {
      return false;
    }

    if (!draft.name.trim()) {
      setMessage("Name is required.");
      return false;
    }
    if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
      setMessage("Amount must be greater than 0.");
      return false;
    }

    const validated = validateLoanMonths({
      startMonth: draft.startMonth,
      status: draft.status,
      paidBackMonth: draft.paidBackMonth
    });
    if (!validated.ok) {
      setMessage(validated.message);
      return false;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/loaned-out/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          amount: draft.amount,
          startMonth: validated.startMonth,
          status: draft.status,
          paidBackMonth: draft.status === "paidBack" ? validated.paidBackMonth : null
        })
      });
      setMessage("Saved loaned-out entry");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save loaned-out entry");
      return false;
    }
  }

  async function deleteItem(id: string): Promise<boolean> {
    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/loaned-out/${id}`, {
        method: "DELETE"
      });
      setMessage("Deleted loaned-out entry");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete loaned-out entry");
      return false;
    }
  }

  return (
    <SectionPanel
      title="Money Loaned Out"
      subtitle="Track money you have loaned out. When marked paid back, dashboard money in bank updates automatically."
      right={
        <p className="text-sm text-[var(--ink-soft)]">
          Outstanding: {formatGBP(totalOutstanding)} | Paid back: {formatGBP(totalPaidBack)}
        </p>
      }
    >
      {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
      {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

      <div className="space-y-3 xl:hidden">
        {items.map((item) => {
          const draft = getDraft(item);
          return (
            <div className="mobile-edit-card" key={`mobile-loaned-out-${item.id}`}>
              <div className="mobile-edit-card-head">
                <div className="min-w-0">
                  <p className="mobile-edit-card-title">{draft.name}</p>
                  <p className="mobile-edit-card-subtitle">
                    Start: {draft.startMonth}
                    {draft.status === "paidBack" && draft.paidBackMonth ? ` | Paid back: ${draft.paidBackMonth}` : ""}
                  </p>
                </div>
                <button className="button-secondary shrink-0" type="button" onClick={() => setMobileEditId(item.id)}>
                  Edit
                </button>
              </div>
              <div className="mobile-edit-keyvals">
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Status</span>
                  <span className="mobile-edit-keyval-value">{formatLoanStatusLabel(draft.status)}</span>
                </div>
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Amount</span>
                  <span className="mobile-edit-keyval-value">{formatGBP(draft.amount)}</span>
                </div>
              </div>
            </div>
          );
        })}

        <button className="button-primary w-full" type="button" onClick={() => setMobileAddOpen(true)}>
          Add loaned-out money
        </button>

        <MobileEditDrawer
          open={Boolean(mobileItem && mobileDraft)}
          title={mobileItem ? `Edit ${mobileItem.name}` : "Edit loaned-out item"}
          subtitle="Update amount, status, and month details."
          onClose={() => setMobileEditId(null)}
          footer={
            <div className="flex flex-col gap-2">
              {mobileItem ? (
                <button
                  className="button-danger w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    const deleted = await deleteItem(mobileItem.id);
                    if (deleted) {
                      setMobileEditId(null);
                    }
                  }}
                >
                  Delete
                </button>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileEditId(null)}>
                  Cancel
                </button>
                <button
                  className="button-primary w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    if (!mobileItem) {
                      return;
                    }
                    const saved = await saveItem(mobileItem.id);
                    if (saved) {
                      setMobileEditId(null);
                    }
                  }}
                >
                  Save loan
                </button>
              </div>
            </div>
          }
        >
          {mobileItem && mobileDraft ? (
            <div className="grid gap-3">
              <div>
                <p className="label">Name</p>
                <input
                  className="input mt-1"
                  value={mobileDraft.name}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, name: event.target.value }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Amount</p>
                <input
                  className="input mt-1"
                  type="number"
                  step="0.01"
                  value={mobileDraft.amount}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, amount: Number(event.target.value) }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Start month</p>
                <input
                  className="input mt-1"
                  type="month"
                  value={mobileDraft.startMonth}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, startMonth: event.target.value }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Status</p>
                <select
                  className="input mt-1"
                  value={mobileDraft.status}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: {
                        ...mobileDraft,
                        status: event.target.value as LoanedOutItem["status"],
                        paidBackMonth:
                          event.target.value === "paidBack" ? mobileDraft.paidBackMonth : undefined
                      }
                    }))
                  }
                >
                  {LOAN_STATUS_OPTIONS.map((option) => (
                    <option key={`mobile-loan-status-${mobileItem.id}-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="label">Paid-back month {mobileDraft.status === "paidBack" ? "" : "(optional)"}</p>
                <input
                  className="input mt-1"
                  type="month"
                  value={mobileDraft.paidBackMonth || ""}
                  disabled={mobileDraft.status !== "paidBack"}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, paidBackMonth: event.target.value || undefined }
                    }))
                  }
                />
              </div>
            </div>
          ) : null}
        </MobileEditDrawer>

        <MobileEditDrawer
          open={mobileAddOpen}
          title="Add loaned-out money"
          subtitle="Track money given out and when it is repaid."
          onClose={() => setMobileAddOpen(false)}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileAddOpen(false)}>
                Cancel
              </button>
              <button
                className="button-primary w-full sm:w-auto"
                type="button"
                onClick={async () => {
                  const created = await createItem();
                  if (created) {
                    setMobileAddOpen(false);
                  }
                }}
              >
                Add loan
              </button>
            </div>
          }
        >
          <div className="grid gap-3">
            <div>
              <p className="label">Name</p>
              <input
                className="input mt-1"
                placeholder="Loan to family"
                value={newItem.name}
                onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Amount</p>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={newItem.amount}
                onChange={(event) => setNewItem((prev) => ({ ...prev, amount: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Start month</p>
              <input
                className="input mt-1"
                type="month"
                value={newItem.startMonth}
                onChange={(event) => setNewItem((prev) => ({ ...prev, startMonth: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Status</p>
              <select
                className="input mt-1"
                value={newItem.status}
                onChange={(event) =>
                  setNewItem((prev) => ({
                    ...prev,
                    status: event.target.value as LoanedOutItem["status"],
                    paidBackMonth: event.target.value === "paidBack" ? prev.paidBackMonth : ""
                  }))
                }
              >
                {LOAN_STATUS_OPTIONS.map((option) => (
                  <option key={`new-loaned-out-status-mobile-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="label">Paid-back month</p>
              <input
                className="input mt-1"
                type="month"
                value={newItem.paidBackMonth}
                disabled={newItem.status !== "paidBack"}
                onChange={(event) => setNewItem((prev) => ({ ...prev, paidBackMonth: event.target.value }))}
              />
            </div>
          </div>
        </MobileEditDrawer>
      </div>

      <div className="table-wrap hidden xl:block">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
              <th>Start month</th>
              <th>Status</th>
              <th>Paid-back month</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className="input"
                    value={drafts[item.id]?.name || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], name: event.target.value }
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={drafts[item.id]?.amount ?? 0}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], amount: Number(event.target.value) }
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="month"
                    value={drafts[item.id]?.startMonth || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], startMonth: event.target.value }
                      }))
                    }
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={drafts[item.id]?.status || "outstanding"}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...prev[item.id],
                          status: event.target.value as LoanedOutItem["status"],
                          paidBackMonth:
                            event.target.value === "paidBack" ? prev[item.id]?.paidBackMonth : undefined
                        }
                      }))
                    }
                  >
                    {LOAN_STATUS_OPTIONS.map((option) => (
                      <option key={`desktop-loaned-out-status-${item.id}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    type="month"
                    value={drafts[item.id]?.paidBackMonth || ""}
                    disabled={drafts[item.id]?.status !== "paidBack"}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], paidBackMonth: event.target.value || undefined }
                      }))
                    }
                  />
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="button-secondary" type="button" onClick={() => saveItem(item.id)}>
                      Save
                    </button>
                    <button className="button-danger" type="button" onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            <tr>
              <td>
                <input
                  className="input"
                  value={newItem.name}
                  placeholder="Loan to family"
                  onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={newItem.amount}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, amount: event.target.value }))}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="month"
                  value={newItem.startMonth}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, startMonth: event.target.value }))}
                />
              </td>
              <td>
                <select
                  className="input"
                  value={newItem.status}
                  onChange={(event) =>
                    setNewItem((prev) => ({
                      ...prev,
                      status: event.target.value as LoanedOutItem["status"],
                      paidBackMonth: event.target.value === "paidBack" ? prev.paidBackMonth : ""
                    }))
                  }
                >
                  {LOAN_STATUS_OPTIONS.map((option) => (
                    <option key={`desktop-new-loaned-out-status-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className="input"
                  type="month"
                  value={newItem.paidBackMonth}
                  disabled={newItem.status !== "paidBack"}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, paidBackMonth: event.target.value }))}
                />
              </td>
              <td>
                <button className="button-primary" type="button" onClick={() => createItem()}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-2 text-sm text-[var(--accent-strong)]">{message}</p> : null}
    </SectionPanel>
  );
}

function MonthlyAdjustmentsCollection({ getIdToken }: { getIdToken: () => Promise<string | null> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MonthlyAdjustment>>({});
  const [mobileEditId, setMobileEditId] = useState<string | null>(null);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    amount: "0",
    category: "houseBills" as MonthlyAdjustment["category"],
    startMonth: "2026-01",
    endMonth: "",
    dueDayOfMonth: "1"
  });

  const query = useQuery({
    queryKey: ["monthly-adjustments"],
    queryFn: () =>
      authedRequest<{ adjustments: MonthlyAdjustment[] }>(getIdToken, "/api/monthly-adjustments")
  });

  useEffect(() => {
    const next: Record<string, MonthlyAdjustment> = {};
    (query.data?.adjustments || [])
      .filter((item) => item.category !== "income")
      .forEach((item) => {
        next[item.id] = {
          ...item,
          dueDayOfMonth: item.dueDayOfMonth ?? 1
        };
      });
    setDrafts(next);
  }, [query.data]);

  const adjustments = (query.data?.adjustments || []).filter((item) => item.category !== "income");
  const total = adjustments.reduce((acc, item) => acc + item.amount, 0);

  function getAdjustmentDraft(item: MonthlyAdjustment): MonthlyAdjustment {
    return (
      drafts[item.id] || {
        ...item,
        dueDayOfMonth: item.dueDayOfMonth ?? 1
      }
    );
  }

  const mobileItem = mobileEditId ? adjustments.find((entry) => entry.id === mobileEditId) || null : null;
  const mobileDraft = mobileItem ? getAdjustmentDraft(mobileItem) : null;

  async function createItem(): Promise<boolean> {
    if (!newItem.name.trim()) {
      setMessage("Name is required.");
      return false;
    }

    const startMonth = normalizeMonthInput(newItem.startMonth);
    if (!startMonth) {
      setMessage("Start month must be in YYYY-MM format.");
      return false;
    }

    const endMonth = newItem.endMonth ? normalizeMonthInput(newItem.endMonth) : null;
    if (newItem.endMonth && !endMonth) {
      setMessage("End month must be in YYYY-MM format.");
      return false;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, "/api/monthly-adjustments", {
        method: "POST",
        body: JSON.stringify({
          name: newItem.name.trim(),
          amount: Number(newItem.amount),
          category: newItem.category,
          startMonth,
          endMonth: endMonth || undefined,
          dueDayOfMonth: parseDueDayInput(newItem.dueDayOfMonth)
        })
      });

      setNewItem({
        name: "",
        amount: "0",
        category: "houseBills",
        startMonth: "2026-01",
        endMonth: "",
        dueDayOfMonth: "1"
      });
      setMessage("Created monthly adjustment");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create adjustment");
      return false;
    }
  }

  async function saveItem(id: string): Promise<boolean> {
    const item = drafts[id];
    if (!item) {
      return false;
    }

    const startMonth = normalizeMonthInput(item.startMonth);
    if (!startMonth) {
      setMessage("Start month must be in YYYY-MM format.");
      return false;
    }

    const endMonth = item.endMonth ? normalizeMonthInput(item.endMonth) : null;
    if (item.endMonth && !endMonth) {
      setMessage("End month must be in YYYY-MM format.");
      return false;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/monthly-adjustments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: item.name,
          amount: item.amount,
          category: item.category,
          startMonth,
          endMonth: endMonth || null,
          dueDayOfMonth: item.dueDayOfMonth ?? null
        })
      });
      setMessage("Saved monthly adjustment");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save adjustment");
      return false;
    }
  }

  async function deleteItem(id: string): Promise<boolean> {
    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/monthly-adjustments/${id}`, {
        method: "DELETE"
      });
      setMessage("Deleted monthly adjustment");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete adjustment");
      return false;
    }
  }

  return (
    <SectionPanel
      title="Monthly Adjustments"
      subtitle="Apply non-income charges or credits by month range. For loans/bonuses, use Extra Income."
      right={<p className="text-sm text-[var(--ink-soft)]">Active Total: {formatGBP(total)}</p>}
    >
      {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
      {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

      <div className="space-y-3 xl:hidden">
        {adjustments.map((item) => {
          const draft = getAdjustmentDraft(item);
          const rangeLabel = draft.endMonth ? `${draft.startMonth} to ${draft.endMonth}` : `${draft.startMonth} onward`;
          return (
            <div className="mobile-edit-card" key={`mobile-adjustment-${item.id}`}>
              <div className="mobile-edit-card-head">
                <div className="min-w-0">
                  <p className="mobile-edit-card-title">{draft.name}</p>
                  <p className="mobile-edit-card-subtitle">{rangeLabel}</p>
                </div>
                <button className="button-secondary shrink-0" type="button" onClick={() => setMobileEditId(item.id)}>
                  Edit
                </button>
              </div>
              <div className="mobile-edit-keyvals">
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Category</span>
                  <span className="mobile-edit-keyval-value">{draft.category}</span>
                </div>
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Amount</span>
                  <span className="mobile-edit-keyval-value">{formatGBP(draft.amount)}</span>
                </div>
                <div className="mobile-edit-keyval">
                  <span className="mobile-edit-keyval-label">Due day</span>
                  <span className="mobile-edit-keyval-value">{draft.dueDayOfMonth || "Not set"}</span>
                </div>
              </div>
            </div>
          );
        })}

        <button className="button-primary w-full" type="button" onClick={() => setMobileAddOpen(true)}>
          Add monthly adjustment
        </button>

        <MobileEditDrawer
          open={Boolean(mobileItem && mobileDraft)}
          title={mobileItem ? `Edit ${mobileItem.name}` : "Edit adjustment"}
          subtitle="Update amount, range, and due day."
          onClose={() => setMobileEditId(null)}
          footer={
            <div className="flex flex-col gap-2">
              {mobileItem ? (
                <button
                  className="button-danger w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    const deleted = await deleteItem(mobileItem.id);
                    if (deleted) {
                      setMobileEditId(null);
                    }
                  }}
                >
                  Delete
                </button>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileEditId(null)}>
                  Cancel
                </button>
                <button
                  className="button-primary w-full sm:w-auto"
                  type="button"
                  onClick={async () => {
                    if (!mobileItem) {
                      return;
                    }
                    const saved = await saveItem(mobileItem.id);
                    if (saved) {
                      setMobileEditId(null);
                    }
                  }}
                >
                  Save adjustment
                </button>
              </div>
            </div>
          }
        >
          {mobileItem && mobileDraft ? (
            <div className="grid gap-3">
              <div>
                <p className="label">Name</p>
                <input
                  className="input mt-1"
                  value={mobileDraft.name}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, name: event.target.value }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Category</p>
                <select
                  className="input mt-1"
                  value={mobileDraft.category}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: {
                        ...mobileDraft,
                        category: event.target.value as MonthlyAdjustment["category"]
                      }
                    }))
                  }
                >
                  <option value="houseBills">houseBills</option>
                  <option value="shopping">shopping</option>
                  <option value="myBills">myBills</option>
                </select>
              </div>
              <div>
                <p className="label">Amount</p>
                <input
                  className="input mt-1"
                  type="number"
                  step="0.01"
                  value={mobileDraft.amount}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, amount: Number(event.target.value) }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Start</p>
                <input
                  className="input mt-1"
                  type="month"
                  value={mobileDraft.startMonth}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, startMonth: event.target.value }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">End (optional)</p>
                <input
                  className="input mt-1"
                  type="month"
                  value={mobileDraft.endMonth || ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: { ...mobileDraft, endMonth: event.target.value }
                    }))
                  }
                />
              </div>
              <div>
                <p className="label">Due day</p>
                <select
                  className="input mt-1"
                  value={mobileDraft.dueDayOfMonth ? String(mobileDraft.dueDayOfMonth) : ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [mobileItem.id]: {
                        ...mobileDraft,
                        dueDayOfMonth: parseDueDayInput(event.target.value)
                      }
                    }))
                  }
                >
                  <option value="">Not set</option>
                  {DUE_DAY_OPTIONS.map((day) => (
                    <option key={`drawer-adjustment-due-${mobileItem.id}-${day}`} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </MobileEditDrawer>

        <MobileEditDrawer
          open={mobileAddOpen}
          title="Add monthly adjustment"
          subtitle="Create extra charges or credits by month range."
          onClose={() => setMobileAddOpen(false)}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setMobileAddOpen(false)}>
                Cancel
              </button>
              <button
                className="button-primary w-full sm:w-auto"
                type="button"
                onClick={async () => {
                  const created = await createItem();
                  if (created) {
                    setMobileAddOpen(false);
                  }
                }}
              >
                Add adjustment
              </button>
            </div>
          }
        >
          <div className="grid gap-3">
            <div>
              <p className="label">Name</p>
              <input
                className="input mt-1"
                value={newItem.name}
                placeholder="New adjustment"
                onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Category</p>
              <select
                className="input mt-1"
                value={newItem.category}
                onChange={(event) =>
                  setNewItem((prev) => ({
                    ...prev,
                    category: event.target.value as MonthlyAdjustment["category"]
                  }))
                }
              >
                <option value="houseBills">houseBills</option>
                <option value="shopping">shopping</option>
                <option value="myBills">myBills</option>
              </select>
            </div>
            <div>
              <p className="label">Amount</p>
              <input
                className="input mt-1"
                type="number"
                step="0.01"
                value={newItem.amount}
                onChange={(event) => setNewItem((prev) => ({ ...prev, amount: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Start month</p>
              <input
                className="input mt-1"
                type="month"
                value={newItem.startMonth}
                onChange={(event) => setNewItem((prev) => ({ ...prev, startMonth: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">End month</p>
              <input
                className="input mt-1"
                type="month"
                value={newItem.endMonth}
                onChange={(event) => setNewItem((prev) => ({ ...prev, endMonth: event.target.value }))}
              />
            </div>
            <div>
              <p className="label">Due day</p>
              <select
                className="input mt-1"
                value={newItem.dueDayOfMonth}
                onChange={(event) =>
                  setNewItem((prev) => ({
                    ...prev,
                    dueDayOfMonth: event.target.value
                  }))
                }
              >
                <option value="">Due day</option>
                {DUE_DAY_OPTIONS.map((day) => (
                  <option key={`new-adjustment-due-mobile-${day}`} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </MobileEditDrawer>
      </div>

      <div className="table-wrap hidden xl:block">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Start</th>
              <th>End</th>
              <th>Due day</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className="input"
                    value={drafts[item.id]?.name || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], name: event.target.value }
                      }))
                    }
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={drafts[item.id]?.category || "houseBills"}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...prev[item.id],
                          category: event.target.value as MonthlyAdjustment["category"]
                        }
                      }))
                    }
                  >
                    <option value="houseBills">houseBills</option>
                    <option value="shopping">shopping</option>
                    <option value="myBills">myBills</option>
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={drafts[item.id]?.amount ?? 0}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], amount: Number(event.target.value) }
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="month"
                    value={drafts[item.id]?.startMonth || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], startMonth: event.target.value }
                      }))
                    }
                    placeholder="YYYY-MM"
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="month"
                    value={drafts[item.id]?.endMonth || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], endMonth: event.target.value }
                      }))
                    }
                    placeholder="YYYY-MM (optional)"
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={drafts[item.id]?.dueDayOfMonth ? String(drafts[item.id]?.dueDayOfMonth) : ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], dueDayOfMonth: parseDueDayInput(event.target.value) }
                      }))
                    }
                  >
                    <option value="">Not set</option>
                    {DUE_DAY_OPTIONS.map((day) => (
                      <option key={`desktop-adjustment-due-${item.id}-${day}`} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="button-secondary" type="button" onClick={() => saveItem(item.id)}>
                      Save
                    </button>
                    <button className="button-danger" type="button" onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            <tr>
              <td>
                <input
                  className="input"
                  value={newItem.name}
                  placeholder="New adjustment"
                  onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                />
              </td>
              <td>
                <select
                  className="input"
                  value={newItem.category}
                  onChange={(event) =>
                    setNewItem((prev) => ({
                      ...prev,
                      category: event.target.value as MonthlyAdjustment["category"]
                    }))
                  }
                >
                  <option value="houseBills">houseBills</option>
                  <option value="shopping">shopping</option>
                  <option value="myBills">myBills</option>
                </select>
              </td>
              <td>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={newItem.amount}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, amount: event.target.value }))}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="month"
                  value={newItem.startMonth}
                  onChange={(event) =>
                    setNewItem((prev) => ({ ...prev, startMonth: event.target.value }))
                  }
                  placeholder="YYYY-MM"
                />
              </td>
              <td>
                <input
                  className="input"
                  type="month"
                  value={newItem.endMonth}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, endMonth: event.target.value }))}
                  placeholder="YYYY-MM"
                />
              </td>
              <td>
                <select
                  className="input"
                  value={newItem.dueDayOfMonth}
                  onChange={(event) =>
                    setNewItem((prev) => ({
                      ...prev,
                      dueDayOfMonth: event.target.value
                    }))
                  }
                >
                  <option value="">Due day</option>
                  {DUE_DAY_OPTIONS.map((day) => (
                    <option key={`desktop-adjustment-new-due-${day}`} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button className="button-primary" type="button" onClick={() => createItem()}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-2 text-sm text-[var(--accent-strong)]">{message}</p> : null}
    </SectionPanel>
  );
}

export default function BillsPage() {
  const { getIdToken } = useAuth();

  return (
    <ProtectedPage title="Bills Collections">
      <div className="space-y-4">
        <LineItemCollection
          title="House Bills"
          subtitle="Recurring household commitments."
          endpoint="/api/house-bills"
          getIdToken={getIdToken}
        />
        <LineItemCollection
          title="Income"
          subtitle="Income sources used in monthly calculations. Set pay day for each income line."
          endpoint="/api/income"
          getIdToken={getIdToken}
        />
        <MonthlyIncomePaydaysCollection getIdToken={getIdToken} />
        <BankBalanceSection getIdToken={getIdToken} />
        <ExtraIncomeCollection getIdToken={getIdToken} />
        <LoanedOutCollection getIdToken={getIdToken} />
        <LineItemCollection
          title="Shopping"
          subtitle="Variable shopping budget items."
          endpoint="/api/shopping"
          getIdToken={getIdToken}
        />
        <LineItemCollection
          title="My Bills"
          subtitle="Personal subscriptions and services."
          endpoint="/api/my-bills"
          getIdToken={getIdToken}
        />
        <MonthlyAdjustmentsCollection getIdToken={getIdToken} />
      </div>
    </ProtectedPage>
  );
}
