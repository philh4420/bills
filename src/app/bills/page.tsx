"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP } from "@/lib/util/format";

interface Item {
  id: string;
  name: string;
  amount: number;
}

interface MonthlyAdjustment {
  id: string;
  name: string;
  amount: number;
  category: "income" | "houseBills" | "shopping" | "myBills";
  startMonth: string;
  endMonth?: string;
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
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("0");
  const [drafts, setDrafts] = useState<Record<string, Item>>({});
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [endpoint],
    queryFn: () => authedRequest<{ items: Item[] }>(getIdToken, endpoint)
  });

  useEffect(() => {
    const next: Record<string, Item> = {};
    (query.data?.items || []).forEach((item) => {
      next[item.id] = item;
    });
    setDrafts(next);
  }, [query.data]);

  const items = query.data?.items || [];
  const total = items.reduce((acc, item) => acc + item.amount, 0);

  async function addItem() {
    if (!newName.trim()) {
      return;
    }

    setMessage(null);
    await authedRequest(getIdToken, endpoint, {
      method: "POST",
      body: JSON.stringify({ name: newName.trim(), amount: Number(newAmount) })
    });
    setNewName("");
    setNewAmount("0");
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
      body: JSON.stringify({ name: item.name, amount: item.amount })
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

      <div className="space-y-3 md:hidden">
        {items.map((item) => {
          const draft = drafts[item.id] || item;
          return (
            <div className="panel p-4" key={`mobile-${item.id}`}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="label">Name</p>
                  <input
                    className="input mt-1"
                    value={draft.name}
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
                </div>
                <div>
                  <p className="label">Amount</p>
                  <input
                    className="input mt-1"
                    type="number"
                    step="0.01"
                    value={draft.amount}
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
                </div>
                <div className="flex items-end text-xs text-[var(--ink-soft)]">
                  Monthly value: {formatGBP(draft.amount)}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => saveItem(item.id)}>
                  Save
                </button>
                <button className="button-danger w-full sm:w-auto" type="button" onClick={() => deleteItem(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        <div className="panel p-4">
          <p className="label">Add item</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <input
                className="input"
                placeholder="New item"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div>
              <input
                className="input"
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(event) => setNewAmount(event.target.value)}
              />
            </div>
            <div className="sm:self-end">
              <button className="button-primary w-full sm:w-auto" type="button" onClick={() => addItem()}>
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrap hidden md:block">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
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

function MonthlyAdjustmentsCollection({ getIdToken }: { getIdToken: () => Promise<string | null> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MonthlyAdjustment>>({});
  const [newItem, setNewItem] = useState({
    name: "",
    amount: "0",
    category: "houseBills" as MonthlyAdjustment["category"],
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
    (query.data?.adjustments || []).forEach((item) => {
      next[item.id] = item;
    });
    setDrafts(next);
  }, [query.data]);

  const adjustments = query.data?.adjustments || [];
  const total = adjustments.reduce((acc, item) => acc + item.amount, 0);

  async function createItem() {
    if (!newItem.name.trim()) {
      setMessage("Name is required.");
      return;
    }

    const startMonth = normalizeMonthInput(newItem.startMonth);
    if (!startMonth) {
      setMessage("Start month must be in YYYY-MM format.");
      return;
    }

    const endMonth = newItem.endMonth ? normalizeMonthInput(newItem.endMonth) : null;
    if (newItem.endMonth && !endMonth) {
      setMessage("End month must be in YYYY-MM format.");
      return;
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
          endMonth: endMonth || undefined
        })
      });

      setNewItem({
        name: "",
        amount: "0",
        category: "houseBills",
        startMonth: "2026-01",
        endMonth: ""
      });
      setMessage("Created monthly adjustment");
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create adjustment");
    }
  }

  async function saveItem(id: string) {
    const item = drafts[id];
    if (!item) {
      return;
    }

    const startMonth = normalizeMonthInput(item.startMonth);
    if (!startMonth) {
      setMessage("Start month must be in YYYY-MM format.");
      return;
    }

    const endMonth = item.endMonth ? normalizeMonthInput(item.endMonth) : null;
    if (item.endMonth && !endMonth) {
      setMessage("End month must be in YYYY-MM format.");
      return;
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
          endMonth: endMonth || null
        })
      });
      setMessage("Saved monthly adjustment");
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save adjustment");
    }
  }

  async function deleteItem(id: string) {
    setMessage(null);
    try {
      await authedRequest(getIdToken, `/api/monthly-adjustments/${id}`, {
        method: "DELETE"
      });
      setMessage("Deleted monthly adjustment");
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete adjustment");
    }
  }

  return (
    <SectionPanel
      title="Monthly Adjustments"
      subtitle="Apply extra charges or credits by month range. Example: Broadband March (double), then April onward normal."
      right={<p className="text-sm text-[var(--ink-soft)]">Active Total: {formatGBP(total)}</p>}
    >
      {query.isLoading ? <p className="text-sm text-[var(--ink-soft)]">Loading...</p> : null}
      {query.error ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

      <div className="space-y-3 md:hidden">
        {adjustments.map((item) => {
          const draft = drafts[item.id] || item;
          return (
            <div className="panel p-4" key={`mobile-adjustment-${item.id}`}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="label">Name</p>
                  <input
                    className="input mt-1"
                    value={draft.name}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], name: event.target.value }
                      }))
                    }
                  />
                </div>
                <div>
                  <p className="label">Category</p>
                  <select
                    className="input mt-1"
                    value={draft.category}
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
                    <option value="income">income</option>
                  </select>
                </div>
                <div>
                  <p className="label">Amount</p>
                  <input
                    className="input mt-1"
                    type="number"
                    step="0.01"
                    value={draft.amount}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], amount: Number(event.target.value) }
                      }))
                    }
                  />
                </div>
                <div>
                  <p className="label">Start</p>
                  <input
                    className="input mt-1"
                    type="month"
                    value={draft.startMonth}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], startMonth: event.target.value }
                      }))
                    }
                  />
                </div>
                <div>
                  <p className="label">End (optional)</p>
                  <input
                    className="input mt-1"
                    type="month"
                    value={draft.endMonth || ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], endMonth: event.target.value }
                      }))
                    }
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => saveItem(item.id)}>
                  Save
                </button>
                <button className="button-danger w-full sm:w-auto" type="button" onClick={() => deleteItem(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        <div className="panel p-4">
          <p className="label">Add monthly adjustment</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <input
                className="input"
                value={newItem.name}
                placeholder="New adjustment"
                onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
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
                <option value="income">income</option>
              </select>
            </div>
            <div>
              <input
                className="input"
                type="number"
                step="0.01"
                value={newItem.amount}
                onChange={(event) => setNewItem((prev) => ({ ...prev, amount: event.target.value }))}
              />
            </div>
            <div>
              <input
                className="input"
                type="month"
                value={newItem.startMonth}
                onChange={(event) =>
                  setNewItem((prev) => ({ ...prev, startMonth: event.target.value }))
                }
              />
            </div>
            <div>
              <input
                className="input"
                type="month"
                value={newItem.endMonth}
                onChange={(event) => setNewItem((prev) => ({ ...prev, endMonth: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <button className="button-primary w-full sm:w-auto" type="button" onClick={() => createItem()}>
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrap hidden md:block">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Start</th>
              <th>End</th>
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
                    <option value="income">income</option>
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
                  <option value="income">income</option>
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
