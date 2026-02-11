"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { MobileEditDrawer } from "@/components/mobile-edit-drawer";
import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP } from "@/lib/util/format";

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

const DUE_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const INCOME_SOURCE_OPTIONS = [
  { value: "loan", label: "Loan" },
  { value: "bonus", label: "Bonus" },
  { value: "other", label: "Other" }
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
  const supportsDueDay = endpoint !== "/api/income";
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
                    <span className="mobile-edit-keyval-label">Due day</span>
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
                <p className="label">Due day</p>
                <select className="input mt-1" value={newDueDay} onChange={(event) => setNewDueDay(event.target.value)}>
                  <option value="">Due day</option>
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
              {supportsDueDay ? <th>Due day</th> : null}
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
                    <option value="">Due day</option>
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
          subtitle="Income sources used in monthly calculations."
          endpoint="/api/income"
          getIdToken={getIdToken}
        />
        <ExtraIncomeCollection getIdToken={getIdToken} />
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
