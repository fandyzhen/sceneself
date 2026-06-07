"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Download, Plus, X } from "lucide-react";
import { formatCode } from "@/lib/redemption/code-utils";

interface BatchRow {
  batchId: string;
  createdBy: string;
  channel: string | null;
  credits: number;
  total: number;
  used: number;
  remaining: number;
  createdAt: string;
}

interface NewBatchResult {
  batchId: string;
  codes: string[];
  credits: number;
  channel: string | null;
}

function downloadCsv(filename: string, lines: string[]) {
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminCodesPage() {
  const t = useTranslations("Admin.redemption");
  const locale = useLocale();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [count, setCount] = useState(50);
  const [credits, setCredits] = useState(500);
  const [channel, setChannel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newBatch, setNewBatch] = useState<NewBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/codes/batches");
      const data = await res.json();
      if (res.ok) setBatches(data.batches ?? []);
      else setError(data.error ?? "Failed to load");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const onCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            count,
            credits,
            channel: channel.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed");
          return;
        }
        setNewBatch({
          batchId: data.batchId,
          codes: data.codes,
          credits,
          channel: channel.trim() || null,
        });
        // 刷新列表
        loadBatches();
      } catch (err) {
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [count, credits, channel, loadBatches],
  );

  const onDownloadNewBatch = useCallback(() => {
    if (!newBatch) return;
    const lines = [
      `code,formatted,credits,channel,batch_id`,
      ...newBatch.codes.map(
        c =>
          `${c},${formatCode(c)},${newBatch.credits},${newBatch.channel ?? ""},${newBatch.batchId}`,
      ),
    ];
    downloadCsv(`${newBatch.batchId}.csv`, lines);
  }, [newBatch]);

  const closeNewBatch = () => {
    setNewBatch(null);
    setCreateOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setNewBatch(null);
            setError(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> {t("newBatch")}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.batchId")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.createdBy")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.channel")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.credits")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.total")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.used")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.remaining")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("table.createdAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batches.map(b => (
                <tr key={b.batchId} className="hover:bg-hover">
                  <td className="px-6 py-4 text-sm font-mono text-foreground">
                    <Link
                      href={`/${locale}/admin/codes/${b.batchId}`}
                      className="hover:underline"
                    >
                      {b.batchId}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {b.createdBy === "admin" ? t("createdByAdmin") : b.createdBy}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {b.channel ?? "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono text-foreground">
                    {b.credits}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono text-foreground">
                    {b.total}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono text-foreground">
                    {b.used}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono text-foreground">
                    {b.remaining}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString(
                      locale === "zh" ? "zh-CN" : "en-US",
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
          {!loading && batches.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {t("empty")}
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeNewBatch}
        >
          <div
            className="bg-background rounded-xl border border-border p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {newBatch ? t("modal.successTitle") : t("modal.title")}
              </h2>
              <button
                type="button"
                onClick={closeNewBatch}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!newBatch && (
              <form onSubmit={onCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t("modal.count")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={count}
                    onChange={e => setCount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t("modal.credits")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={credits}
                    onChange={e => setCredits(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t("modal.channel")}
                  </label>
                  <input
                    type="text"
                    value={channel}
                    onChange={e => setChannel(e.target.value)}
                    placeholder={t("modal.channelPlaceholder")}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeNewBatch}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-hover"
                  >
                    {t("modal.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? t("modal.submitting") : t("modal.create")}
                  </button>
                </div>
              </form>
            )}

            {newBatch && (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {t("modal.generated", {
                    count: newBatch.codes.length,
                    batch: newBatch.batchId,
                  })}
                </div>
                <button
                  type="button"
                  onClick={onDownloadNewBatch}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-hover"
                >
                  <Download className="h-4 w-4" /> {t("modal.downloadCsv")}
                </button>
                <div className="max-h-72 overflow-y-auto border border-border rounded-lg p-3 font-mono text-xs space-y-1">
                  {newBatch.codes.map(c => (
                    <div key={c} className="text-foreground">
                      {formatCode(c)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
