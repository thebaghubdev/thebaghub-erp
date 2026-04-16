import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";

/** API fields used on this page only (decoupled from inventory detail UI). */
type ItemAuthenticationPayload = {
  sku: string;
  itemSnapshot: {
    form: Record<string, unknown>;
  };
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function ItemAuthenticationPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<ItemAuthenticationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${id}`, {}, token);
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Inventory item not found."
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as ItemAuthenticationPayload;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load item");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Unable to load this item."}
        </p>
        <Link
          to="/portal/authentication"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to authentication
        </Link>
      </div>
    );
  }

  const form = detail.itemSnapshot.form;
  const brand = str(form.brand);
  const itemModel = str(form.itemModel);
  const brandModelSubtitle =
    brand && itemModel ? `${brand} — ${itemModel}` : brand || itemModel || "—";

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Item authentication
          </p>
          <h1 className="mt-1 break-all font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <p className="mt-2 break-words text-base text-slate-700 dark:text-slate-300">
            {brandModelSubtitle}
          </p>
        </div>
        <Link
          to="/portal/authentication"
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to authentication
        </Link>
      </div>
    </div>
  );
}
