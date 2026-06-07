"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Download } from "lucide-react";
import { formatCode } from "@/lib/redemption/code-utils";

interface CodeRow {
  code: string;
  credits: number;
  channel: string | null;
  usedBy: string | null;
  usedAt: string | null;
  createdBy: string;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
}

interface BatchDetailPageProps {
  batchId: string;
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

export function BatchDetailPage({ batchId }: BatchDetailPageProps) {
  const t = useTranslations("Admin.redemption");
  const locale = useLocale();
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CodeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/codes/batches/${batchId}`);
      const data = await res.json();
      if (res.ok) setCodes(data.codes ?? []);
      else setError(data.error ?? "Failed to load");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const onDownload = useCallback(() => {
    const lines = [
      `code,formatted,credits,channel,used_by_email,used_at,created_at`,
      ...codes.map(c =>
        [
          c.code,
          formatCode(c.code),
          c.credits,
          c.channel ?? "",
          c.userEmail ?? "",
          c.usedAt ?? "",
          c.createdAt,
        ].join(","),
      ),
    ];
    downloadCsv(`${batchId}.csv`, lines);
  }, [codes, batchId]);

  const total = codes.length;
  const used = codes.filter(c => !!c.usedBy).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/admin/codes`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("backToList")}
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            <span className="font-mono">{batchId}</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={loading || codes.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-hover disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> {t("modal.downloadCsv")}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {t("detail.summary", { total, used, remaining: total - used })}
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("detail.code")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("detail.credits")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("detail.status")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("detail.usedBy")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {codes.map(c => {
                const isUsed = !!c.usedBy;
                return (
                  <tr
                    key={c.code}
                    className="hover:bg-hover cursor-pointer"
                    onClick={() => isUsed && setSelected(c)}
                  >
                    <td className="px-4 py-3 text-sm font-mono">
                      <span
                        className={
                          isUsed
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }
                      >
                        {formatCode(c.code)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-foreground">
                      {c.credits}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          isUsed
                            ? "bg-red-500/10 text-red-500"
                            : "bg-green-500/10 text-green-500"
                        }`}
                      >
                        {isUsed ? t("detail.used") : t("detail.unused")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {c.userEmail ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              {t("loading")}
            </div>
          )}
          {!loading && codes.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {t("detail.empty")}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-background rounded-xl border border-border p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-3 text-foreground">
              {formatCode(selected.code)}
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("detail.credits")}</dt>
                <dd className="text-foreground font-mono">{selected.credits}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("detail.usedBy")}</dt>
                <dd className="text-foreground">
                  {selected.userEmail ?? selected.usedBy}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("detail.usedAt")}</dt>
                <dd className="text-foreground">
                  {selected.usedAt
                    ? new Date(selected.usedAt).toLocaleString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )
                    : "-"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-hover"
              >
                {t("modal.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
