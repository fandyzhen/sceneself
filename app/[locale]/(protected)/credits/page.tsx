"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/button";
import { Container } from "@/components/container";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { formatVisualCode, normalizeCode, CODE_LENGTH } from "@/lib/redemption/code-utils";
import type {
  ClientUserProfile,
  CreditHistoryRecord,
  CreditHistoryResponse,
  UserProfileResponse,
} from "@/lib/client-api";

export default function CreditsPage() {
  const session = useSession();
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('credits');
  const tCommon = useTranslations('common');
  const [userProfile, setUserProfile] = useState<ClientUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditHistory, setCreditHistory] = useState<CreditHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);

  // Fetch user profile with credits
  const fetchUserProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/user/profile");
      if (response.ok) {
        const data = (await response.json()) as UserProfileResponse;
        setUserProfile(data.user);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch credit history with pagination
  const fetchCreditHistory = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    setLoadingHistory(true);
    try {
      const offset = (pageNum - 1) * limit;
      const response = await fetch(`/api/user/credits/history?limit=${limit}&offset=${offset}`);
      if (response.ok) {
        const data = (await response.json()) as CreditHistoryResponse;
        if (append) {
          setCreditHistory(prev => [...prev, ...data.history]);
        } else {
          setCreditHistory(data.history);
        }
        setHasMore(data.history.length === limit);
      }
    } catch (error) {
      console.error("Error fetching credit history:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [limit]);

  useEffect(() => {
    if (session.data?.user?.id) {
      fetchUserProfile();
      fetchCreditHistory(1);
    }
  }, [session.data?.user?.id, fetchUserProfile, fetchCreditHistory]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchCreditHistory(nextPage, true);
  };

  const goToPricing = useCallback(() => {
    router.push(`/${locale}/pricing`);
  }, [locale, router]);

  const onRedeem = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setRedeemError(null);
      setRedeemSuccess(null);
      const normalized = normalizeCode(redeemInput);
      if (normalized.length !== CODE_LENGTH) {
        setRedeemError(t("redeem.invalid"));
        return;
      }
      setRedeemBusy(true);
      try {
        const res = await fetch("/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: normalized }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 404) setRedeemError(t("redeem.notFound"));
          else if (res.status === 409) setRedeemError(t("redeem.alreadyUsed"));
          else if (res.status === 410) setRedeemError(t("redeem.expired"));
          else if (res.status === 400) setRedeemError(t("redeem.invalid"));
          else if (res.status === 401) setRedeemError(t("redeem.unauthorized"));
          else setRedeemError(data?.error ?? t("redeem.failed"));
          return;
        }
        setRedeemSuccess(
          t("redeem.success", {
            credits: data.creditsAdded ?? 0,
            balance: data.newBalance ?? 0,
          }),
        );
        setRedeemInput("");
        // refresh profile + history
        fetchUserProfile();
        fetchCreditHistory(1);
        setPage(1);
      } catch (err) {
        setRedeemError(String(err));
      } finally {
        setRedeemBusy(false);
      }
    },
    [redeemInput, t, fetchUserProfile, fetchCreditHistory],
  );

  const credits = userProfile?.credits ?? 0;

  if (loading && !session.data?.user) {
    return (
      <div className="relative min-h-screen">
        
        <Container className="relative z-10 py-20">
          <div className="flex justify-center items-center h-64">
            <p className="text-muted-foreground">{tCommon('status.loading')}</p>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      
      <Container className="relative z-10 py-20">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ease: "easeOut", duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-4">
            {t('title')}
          </h1>
          <p className="text-xl text-muted-foreground mb-12">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Redeem code card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ease: "easeOut", duration: 0.5, delay: 0.05 }}
          className="mb-6"
        >
          <div className="bg-card/50 backdrop-blur-md rounded-2xl p-6 border border-border">
            <h2 className="text-lg font-medium text-card-foreground">
              {t("redeem.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("redeem.subtitle")}
            </p>
            <form onSubmit={onRedeem} className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={redeemInput}
                onChange={(e) => setRedeemInput(formatVisualCode(e.target.value))}
                placeholder="ABCD-EFGH-JKMN"
                maxLength={14}
                aria-label={t("redeem.title")}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-mono uppercase tracking-wider text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={redeemBusy}
              >
                {redeemBusy ? t("redeem.processing") : t("redeem.button")}
              </Button>
            </form>
            {redeemError && (
              <p className="mt-2 text-xs text-red-500" role="alert">
                {redeemError}
              </p>
            )}
            {redeemSuccess && (
              <p className="mt-2 text-xs text-green-600 dark:text-green-400" role="status">
                {redeemSuccess}
              </p>
            )}
          </div>
        </motion.div>

        {/* Credits Overview */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ease: "easeOut", duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        >
          {/* Current Balance */}
          <div className="bg-card/50 backdrop-blur-md rounded-2xl p-6 border border-border">
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              {t('balance.title')}
            </h3>
            <div className="text-4xl font-bold text-card-foreground mb-4">
              {credits}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('balance.description')}
            </p>
          </div>

          {/* Upgrade prompt (story-pack 已下线，引导用户升级订阅) */}
          <div className="bg-card/50 backdrop-blur-md rounded-2xl p-6 border border-border">
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              {t('purchase.title')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('purchase.upgradeHint')}
            </p>
            <Button
              variant="primary"
              className="w-full justify-center"
              onClick={goToPricing}
            >
              {t('purchase.upgradePlan')}
            </Button>
          </div>

          {/* Usage Statistics */}
          <div className="bg-card/50 backdrop-blur-md rounded-2xl p-6 border border-border">
            <h3 className="text-lg font-medium text-muted-foreground mb-4">
              {t('statistics.title')}
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('statistics.thisMonth')}</span>
                <span className="font-medium text-card-foreground">
                  {creditHistory.filter(r => 
                    new Date(r.createdAt).getMonth() === new Date().getMonth() && 
                    r.amount < 0
                  ).reduce((sum, r) => sum + Math.abs(r.amount), 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('statistics.totalPurchased')}</span>
                <span className="font-medium text-card-foreground">
                  {creditHistory.filter(r => r.type === 'purchase' && r.amount > 0)
                    .reduce((sum, r) => sum + r.amount, 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('statistics.totalUsed')}</span>
                <span className="font-medium text-card-foreground">
                  {creditHistory.filter(r => r.amount < 0)
                    .reduce((sum, r) => sum + Math.abs(r.amount), 0)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Credit History Table */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ease: "easeOut", duration: 0.5, delay: 0.2 }}
        >
          <div className="bg-card/50 backdrop-blur-md rounded-2xl p-6 border border-border">
            <h3 className="text-xl font-semibold text-card-foreground mb-4">
              {t('history.title')}
            </h3>

            {loadingHistory && creditHistory.length === 0 ? (
              <div className="text-center py-4">
                <span className="text-muted-foreground">{tCommon('status.loading')}</span>
              </div>
            ) : creditHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('history.noRecords')}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                          {t('history.columns.time')}
                        </th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                          {t('history.columns.type')}
                        </th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                          {t('history.columns.description')}
                        </th>
                        <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">
                          {t('history.columns.amount')}
                        </th>
                        <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">
                          {t('history.columns.balance')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditHistory.map((record, index) => {
                        // Calculate running balance (from current balance backwards)
                        // Most recent transactions are first, so we subtract previous transactions
                        const runningBalance = credits - creditHistory
                          .slice(0, index)
                          .reduce((sum, r) => sum + r.amount, 0);
                        
                        return (
                          <tr
                            key={record.id}
                            className="border-b border-border hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3 px-2 text-sm text-card-foreground">
                              {new Date(record.createdAt).toLocaleString(locale, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 px-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                record.type === 'purchase' || record.type === 'subscription'
                                  ? 'bg-green-500/10 text-green-600'
                                  : record.type === 'usage'
                                  ? 'bg-red-500/10 text-red-600'
                                  : record.type === 'bonus'
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {t(`history.types.${record.type}`)}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-sm text-card-foreground">
                              {t(`history.reasons.${record.reason}`, {
                                defaultValue: record.reason
                              })}
                            </td>
                            <td className="py-3 px-2 text-sm text-right font-mono">
                              <span className={record.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                                {record.amount > 0 ? '+' : ''}{record.amount}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-sm text-right font-mono text-muted-foreground">
                              {runningBalance}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Load More Button */}
                {hasMore && (
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={loadingHistory}
                    >
                      {loadingHistory ? tCommon('status.loading') : t('history.loadMore')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </Container>
    </div>
  );
}
