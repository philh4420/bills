"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ProtectedPage } from "@/components/protected-page";
import { SectionPanel } from "@/components/section-panel";
import { authedRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/client";
import { formatGBP } from "@/lib/util/format";

interface Purchase {
  id: string;
  name: string;
  price: number;
  alias?: string;
  link?: string;
  status: "planned" | "bought" | "skipped";
}

export default function PurchasesPage() {
  const { getIdToken } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, Purchase>>({});
  const [message, setMessage] = useState<string | null>(null);

  const [newItem, setNewItem] = useState({
    name: "",
    price: "0",
    alias: "",
    link: ""
  });

  const query = useQuery({
    queryKey: ["purchases"],
    queryFn: () => authedRequest<{ purchases: Purchase[] }>(getIdToken, "/api/purchases")
  });

  useEffect(() => {
    const next: Record<string, Purchase> = {};
    (query.data?.purchases || []).forEach((item) => {
      next[item.id] = item;
    });
    setDrafts(next);
  }, [query.data]);

  const purchases = useMemo(() => query.data?.purchases || [], [query.data?.purchases]);

  const totals = useMemo(() => {
    const planned = purchases.filter((item) => item.status === "planned").reduce((acc, item) => acc + item.price, 0);
    const bought = purchases.filter((item) => item.status === "bought").reduce((acc, item) => acc + item.price, 0);
    return { planned, bought };
  }, [purchases]);

  async function createPurchase() {
    setMessage(null);
    await authedRequest(getIdToken, "/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        name: newItem.name,
        price: Number(newItem.price),
        alias: newItem.alias || undefined,
        link: newItem.link || undefined,
        status: "planned"
      })
    });

    setNewItem({ name: "", price: "0", alias: "", link: "" });
    setMessage("Created purchase");
    await query.refetch();
  }

  async function savePurchase(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    setMessage(null);
    await authedRequest(getIdToken, `/api/purchases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: draft.name,
        price: draft.price,
        alias: draft.alias,
        link: draft.link,
        status: draft.status
      })
    });

    setMessage(`Updated ${draft.name}`);
    await query.refetch();
  }

  return (
    <ProtectedPage title="Purchase Planner">
      <div className="space-y-4">
        <SectionPanel title="Planned purchases" subtitle="Track future purchases and completion state.">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div className="panel p-4">
              <p className="label">Planned total</p>
              <p className="metric-value mt-2">{formatGBP(totals.planned)}</p>
            </div>
            <div className="panel p-4">
              <p className="label">Bought total</p>
              <p className="metric-value mt-2">{formatGBP(totals.bought)}</p>
            </div>
          </div>

          {query.isLoading ? <p className="mb-3 text-sm text-[var(--ink-soft)]">Loading purchases...</p> : null}

          <div className="space-y-3 md:hidden">
            {purchases.map((item) => {
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
                            [item.id]: { ...prev[item.id], name: event.target.value }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <p className="label">Price</p>
                      <input
                        className="input mt-1"
                        type="number"
                        step="0.01"
                        value={draft.price}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], price: Number(event.target.value) }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <p className="label">Status</p>
                      <select
                        className="input mt-1"
                        value={draft.status}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...prev[item.id],
                              status: event.target.value as Purchase["status"]
                            }
                          }))
                        }
                      >
                        <option value="planned">planned</option>
                        <option value="bought">bought</option>
                        <option value="skipped">skipped</option>
                      </select>
                    </div>
                    <div>
                      <p className="label">Alias</p>
                      <input
                        className="input mt-1"
                        value={draft.alias || ""}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], alias: event.target.value }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <p className="label">Link</p>
                      <input
                        className="input mt-1"
                        value={draft.link || ""}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], link: event.target.value }
                          }))
                        }
                      />
                    </div>
                  </div>
                  <button className="button-secondary mt-3 w-full sm:w-auto" type="button" onClick={() => savePurchase(item.id)}>
                    Save
                  </button>
                </div>
              );
            })}

            <div className="panel p-4">
              <p className="label">Add purchase</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <input
                    className="input"
                    placeholder="New item"
                    value={newItem.name}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={newItem.price}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, price: event.target.value }))}
                  />
                </div>
                <div>
                  <input
                    className="input"
                    placeholder="Alias"
                    value={newItem.alias}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    className="input"
                    placeholder="Link"
                    value={newItem.link}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, link: event.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-sm text-[var(--ink-soft)]">Status: planned</p>
                </div>
                <div className="sm:text-right">
                  <button className="button-primary w-full sm:w-auto" type="button" onClick={() => createPurchase()}>
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
                  <th>Price</th>
                  <th>Alias</th>
                  <th>Link</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((item) => (
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
                        value={drafts[item.id]?.price ?? 0}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], price: Number(event.target.value) }
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={drafts[item.id]?.alias || ""}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], alias: event.target.value }
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={drafts[item.id]?.link || ""}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], link: event.target.value }
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        value={drafts[item.id]?.status || "planned"}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...prev[item.id],
                              status: event.target.value as Purchase["status"]
                            }
                          }))
                        }
                      >
                        <option value="planned">planned</option>
                        <option value="bought">bought</option>
                        <option value="skipped">skipped</option>
                      </select>
                    </td>
                    <td>
                      <button className="button-secondary" type="button" onClick={() => savePurchase(item.id)}>
                        Save
                      </button>
                    </td>
                  </tr>
                ))}

                <tr>
                  <td>
                    <input
                      className="input"
                      placeholder="New item"
                      value={newItem.name}
                      onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      value={newItem.price}
                      onChange={(event) => setNewItem((prev) => ({ ...prev, price: event.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={newItem.alias}
                      onChange={(event) => setNewItem((prev) => ({ ...prev, alias: event.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={newItem.link}
                      onChange={(event) => setNewItem((prev) => ({ ...prev, link: event.target.value }))}
                    />
                  </td>
                  <td>
                    <span className="text-sm text-[var(--ink-soft)]">planned</span>
                  </td>
                  <td>
                    <button className="button-primary" type="button" onClick={() => createPurchase()}>
                      Add
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {query.error ? <p className="mt-2 text-sm text-red-700">{(query.error as Error).message}</p> : null}
          {message ? <p className="mt-2 text-sm text-[var(--accent-strong)]">{message}</p> : null}
        </SectionPanel>
      </div>
    </ProtectedPage>
  );
}
