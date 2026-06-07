"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Plus, ShieldX, X } from "lucide-react";

interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  dailyLimit: number;
  codesToday: number;
  totalGenerated: number;
  todayResetsAt: string;
  createdAt: string;
  lastUsedAt: string | null;
  deactivated: boolean;
}

interface NewKeyResult {
  id: string;
  name: string;
  keyPrefix: string;
  plaintextKey: string;
  dailyLimit: number;
}

export function AdminApiKeysPage() {
  const t = useTranslations("Admin.apiKeys");
  const locale = useLocale();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(1000);
  const [submitting, setSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      if (res.ok) setKeys(data.keys ?? []);
      else setError(data.error ?? "Failed to load");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), dailyLimit }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed");
          return;
        }
        setNewKey({
          id: data.id,
          name: data.name,
          keyPrefix: data.keyPrefix,
          plaintextKey: data.plaintextKey,
          dailyLimit: data.dailyLimit,
        });
        setName("");
        load();
      } catch (err) {
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [name, dailyLimit, load],
  );

  const onCopy = useCallback(async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.plaintextKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [newKey]);

  const onDeactivate = useCallback(
    async (id: string) => {
      if (!confirm(t("confirmDeactivate"))) return;
      try {
        const res = await fetch(`/api/admin/api-keys/${id}/deactivate`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed");
          return;
        }
        load();
      } catch (err) {
        setError(String(err));
      }
    },
    [load, t],
  );

  const closeModal = () => {
    setCreateOpen(false);
    setNewKey(null);
    setCopied(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setNewKey(null);
            setError(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {t("newKey")}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.keyPrefix")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.dailyLimit")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.codesToday")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.totalGenerated")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.lastUsedAt")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.status")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-hover">
                  <td className="px-4 py-3 text-sm text-foreground">{k.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                    {k.keyPrefix}...
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-foreground">
                    {k.dailyLimit}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-foreground">
                    {k.codesToday}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-foreground">
                    {k.totalGenerated}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleString(
                          locale === "zh" ? "zh-CN" : "en-US",
                        )
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                        k.deactivated
                          ? "bg-red-500/10 text-red-500"
                          : "bg-green-500/10 text-green-500"
                      }`}
                    >
                      {k.deactivated ? t("status.deactivated") : t("status.active")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {!k.deactivated && (
                      <button
                        type="button"
                        onClick={() => onDeactivate(k.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-red-500 hover:bg-red-500/10"
                      >
                        <ShieldX className="h-3.5 w-3.5" /> {t("deactivate")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              {t("loading")}
            </div>
          )}
          {!loading && keys.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {t("empty")}
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-background rounded-xl border border-border p-6 max-w-lg w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {newKey ? t("modal.successTitle") : t("modal.title")}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!newKey ? (
              <form onSubmit={onCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t("modal.name")}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t("modal.namePlaceholder")}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t("modal.dailyLimit")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    value={dailyLimit}
                    onChange={e => setDailyLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-hover"
                  >
                    {t("modal.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? t("modal.submitting") : t("modal.create")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                  {t("modal.warning")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("modal.nameLabel")}: <b className="text-foreground">{newKey.name}</b>
                </div>
                <div className="flex items-center gap-2 border border-border rounded-lg p-2">
                  <code className="flex-1 font-mono text-xs break-all text-foreground">
                    {newKey.plaintextKey}
                  </code>
                  <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-hover"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? t("modal.copied") : t("modal.copy")}
                  </button>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-hover"
                  >
                    {t("modal.done")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
