"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { MobileEditDrawer } from "@/components/mobile-edit-drawer";
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
  const [mobileEditId, setMobileEditId] = useState<string | null>(null);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);

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

  function getPurchaseDraft(item: Purchase): Purchase {
    return drafts[item.id] || item;
  }

  const mobileItem = mobileEditId ? purchases.find((entry) => entry.id === mobileEditId) || null : null;
  const mobileDraft = mobileItem ? getPurchaseDraft(mobileItem) : null;

  async function createPurchase(): Promise<boolean> {
    if (!newItem.name.trim()) {
      setMessage("Name is required.");
      return false;
    }

    setMessage(null);
    try {
      await authedRequest(getIdToken, "/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          name: newItem.name.trim(),
          price: Number(newItem.price),
          alias: newItem.alias || undefined,
          link: newItem.link || undefined,
          status: "planned"
        })
      });

      setNewItem({ name: "", price: "0", alias: "", link: "" });
      setMessage("Created purchase");
      await query.refetch();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create purchase");
      return false;
    }
  }

  async function savePurchase(id: string): Promise<boolean> {
    const draft = drafts[id];
    if (!draft) {
      return false;
    }

    setMessage(null);
    try {
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
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update purchase");
      return false;
    }
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

          <div className="space-y-3 xl:hidden">
            {purchases.map((item) => {
              const draft = getPurchaseDraft(item);
              return (
                <div className="mobile-edit-card" key={`mobile-${item.id}`}>
                  <div className="mobile-edit-card-head">
                    <div className="min-w-0">
                      <p className="mobile-edit-card-title">{draft.name}</p>
                      <p className="mobile-edit-card-subtitle">Status: {draft.status}</p>
                    </div>
                    <button className="button-secondary shrink-0" type="button" onClick={() => setMobileEditId(item.id)}>
                      Edit
                    </button>
                  </div>
                  <div className="mobile-edit-keyvals">
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Price</span>
                      <span className="mobile-edit-keyval-value">{formatGBP(draft.price)}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Alias</span>
                      <span className="mobile-edit-keyval-value">{draft.alias || "None"}</span>
                    </div>
                    <div className="mobile-edit-keyval">
                      <span className="mobile-edit-keyval-label">Link</span>
                      <span className="mobile-edit-keyval-value truncate">{draft.link || "None"}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <button className="button-primary w-full" type="button" onClick={() => setMobileAddOpen(true)}>
              Add purchase
            </button>

            <MobileEditDrawer
              open={Boolean(mobileItem && mobileDraft)}
              title={mobileItem ? `Edit ${mobileItem.name}` : "Edit purchase"}
              subtitle="Update purchase details and status."
              onClose={() => setMobileEditId(null)}
              footer={
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
                      const saved = await savePurchase(mobileItem.id);
                      if (saved) {
                        setMobileEditId(null);
                      }
                    }}
                  >
                    Save purchase
                  </button>
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
                    <p className="label">Price</p>
                    <input
                      className="input mt-1"
                      type="number"
                      step="0.01"
                      value={mobileDraft.price}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [mobileItem.id]: { ...mobileDraft, price: Number(event.target.value) }
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
                      value={mobileDraft.alias || ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [mobileItem.id]: { ...mobileDraft, alias: event.target.value }
                        }))
                      }
                    />
                  </div>
                  <div>
                    <p className="label">Link</p>
                    <input
                      className="input mt-1"
                      value={mobileDraft.link || ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [mobileItem.id]: { ...mobileDraft, link: event.target.value }
                        }))
                      }
                    />
                  </div>
                </div>
              ) : null}
            </MobileEditDrawer>

            <MobileEditDrawer
              open={mobileAddOpen}
              title="Add purchase"
              subtitle="Track a future purchase."
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
                      const created = await createPurchase();
                      if (created) {
                        setMobileAddOpen(false);
                      }
                    }}
                  >
                    Add purchase
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
                    value={newItem.name}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div>
                  <p className="label">Price</p>
                  <input
                    className="input mt-1"
                    type="number"
                    step="0.01"
                    value={newItem.price}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, price: event.target.value }))}
                  />
                </div>
                <div>
                  <p className="label">Alias</p>
                  <input
                    className="input mt-1"
                    placeholder="Alias"
                    value={newItem.alias}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                </div>
                <div>
                  <p className="label">Link</p>
                  <input
                    className="input mt-1"
                    placeholder="Link"
                    value={newItem.link}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, link: event.target.value }))}
                  />
                </div>
                <p className="text-sm text-[var(--ink-soft)]">Status: planned</p>
              </div>
            </MobileEditDrawer>
          </div>

          <div className="table-wrap hidden xl:block">
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
