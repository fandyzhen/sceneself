"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Fraunces } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Camera, Check, ChevronLeft, ChevronRight, Download, Loader2, Pencil, RotateCcw, Sparkles, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { SCENE_TONES } from "@/constants/scene-storylines";
import { CREDITS_PER_PHOTO, UNDELIVERED_REFUND_MULTIPLIER } from "@/lib/scene/pricing";
import * as api from "./scene-api";
import type { ScenePlan } from "@/lib/scene/types";
import type { ClarifyResult, JobView } from "./scene-api";
import { DownloadAllButton } from "./download-all-button";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

// 胶片颗粒
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// v2：去掉 review；clarify 完直接进 generating
// clarify 拆成 tone + focus 两个分屏,沿用同一 answers state,
// 进度条 4 段反映 upload→describe→Q1→Q2。
type Step = "upload" | "describe" | "tone" | "focus" | "generating" | "result";
const FLOW: Step[] = ["upload", "describe", "tone", "focus"];

// 8 个 spark chips,每个对应一个 storyline cluster,海外年轻人导向:
//   tokyo       → journey         (Tokyo night walk)
//   fantasyHero → fantasy_role    (Become Superman)
//   vogue       → profession      (Vogue editor day)
//   lambo       → ownership_flex  (Lamborghini weekend)
//   cafe        → milestone_event (Opening cafe)
//   slowSunday  → lifestyle       (Slow Sunday, coffee & books)
//   xmas        → seasonal        (Christmas market)
//   glowUp      → transformation  (Glow-up year in Bali)
const CHIP_KEYS = ["tokyo", "fantasyHero", "vogue", "lambo", "cafe", "slowSunday", "xmas", "glowUp"] as const;


export default function CreatePage() {
  const t = useTranslations("scene");
  const locale = useLocale();
  const router = useRouter();
  const session = useSession();

  const [step, setStep] = useState<Step>("upload");
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmedOwn, setConfirmedOwn] = useState(false);
  const [rawPrompt, setRawPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarify, setClarify] = useState<ClarifyResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobView, setJobView] = useState<JobView | null>(null);
  // 在 generating 阶段显示的"前置失败"信息（plan/createJob 任一步失败时使用）。
  // 与 step="clarify" 时的 error 分开，避免回退后展示陈旧错误。
  const [setupError, setSetupError] = useState<string | null>(null);
  // 结果页 lightbox:存当前放大查看的帧在 resultFrames 数组里的下标(null=未打开)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // describe 步骤的灵感 chips:每次 mount 从 CHIP_KEYS(8 个) 随机选 3 个显示,
  // 避免 8 条文字占屏太多。SSR 输出前 3 个固定值,客户端 hydrate 后立即 reroll(避免 hydration mismatch)。
  const [visibleChips, setVisibleChips] = useState<readonly typeof CHIP_KEYS[number][]>(() => CHIP_KEYS.slice(0, 3));
  useEffect(() => {
    const shuffled = [...CHIP_KEYS].sort(() => Math.random() - 0.5);
    setVisibleChips(shuffled.slice(0, 3));
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── 登录门槛：未登录跳登录页（生成是扣积分动作）──
  useEffect(() => {
    if (!session.isPending && !session.data) {
      router.replace(`/${locale}/login`);
    }
  }, [session.isPending, session.data, locale, router]);

  const onPickFile = useCallback(
    async (file: File) => {
      setError(null);
      const okType =
        file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name) || file.type === "";
      if (!okType) return setError(t("errors.invalidType"));
      if (file.size > 12 * 1024 * 1024) return setError(t("errors.tooLarge"));
      try {
        setSelfiePreview(URL.createObjectURL(file));
      } catch {
        /* ignore */
      }
      setUploading(true);
      try {
        const url = await api.uploadSelfie(file);
        setSelfieUrl(url);
        // HEIC 本地预览可能失败，用服务端（已转码）URL 兜底
        if (/\.(heic|heif)$/i.test(file.name)) setSelfiePreview(url);
      } catch (e) {
        const fi = (e as { faceIssue?: string })?.faceIssue;
        if (fi === "no_face") setError(t("upload.faceNoFace"));
        else if (fi === "multiple_people") setError(t("upload.faceMultiple"));
        else setError(t("errors.upload"));
        setSelfiePreview(null);
      } finally {
        setUploading(false);
      }
    },
    [t],
  );

  const submitDescribe = useCallback(async () => {
    if (!rawPrompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.clarifyScene(rawPrompt.trim());
      setClarify(r);
      setAnswers({});
      setOtherOpen({});
      setStep("tone");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }, [rawPrompt, t]);

  // v2：答完问题立即跳 generating，plan + createJob 在 generating 内异步跑。
  // 之前是在 clarify 页 await 整个 37s（planScene 32s + createJob 5.7s）只显示 button busy，
  // 用户看不到反馈感焦虑。改为立即过渡到"显影"页面，把等待统一在一个地方做。
  const submitClarify = useCallback(() => {
    if (!clarify?.safePrompt || !selfieUrl) return;
    setError(null);
    setSetupError(null);
    setScenePlan(null);
    setJobId(null);
    setJobView(null);
    setStep("generating");

    const safePrompt = clarify.safePrompt;
    const currentSelfieUrl = selfieUrl;
    const currentAnswers = answers;

    void (async () => {
      try {
        const planned = await api.planScene(safePrompt, currentAnswers);
        if (!planned.scenePlan) {
          setSetupError(planned.error ?? t("errors.generic"));
          return;
        }
        setScenePlan(planned.scenePlan);

        const job = await api.createSceneJob({
          selfieUrl: currentSelfieUrl,
          scenePlan: planned.scenePlan,
          safePrompt,
        });
        if (job.jobId) {
          setJobId(job.jobId);
        } else if (job.code === "auth_required") {
          router.replace(`/${locale}/login`);
        } else if (job.code === "insufficient_credits") {
          setSetupError(t("errors.insufficientCredits"));
        } else {
          setSetupError(job.error ?? t("errors.generic"));
        }
      } catch {
        setSetupError(t("errors.generic"));
      }
    })();
  }, [clarify, answers, selfieUrl, locale, router, t]);

  const backToClarifyFromGenerating = useCallback(() => {
    setSetupError(null);
    setStep("focus");
  }, []);

  // 单次拉取 jobView：供轮询 + visibility 切回时复用
  const fetchJobView = useCallback(async () => {
    if (!jobId) return;
    try {
      const v = await api.fetchJob(jobId);
      setJobView(v);
      if (["completed", "partial", "failed"].includes(v.job.status)) setStep("result");
    } catch {
      /* 继续轮询 */
    }
  }, [jobId]);

  // 轮询逐张揭晓
  useEffect(() => {
    if (step !== "generating" || !jobId) return;
    fetchJobView();
    const id = setInterval(fetchJobView, 2500);
    return () => clearInterval(id);
  }, [step, jobId, fetchJobView]);

  // 切回页面时立刻强制 fetch 一次（visibilitychange）：
  // 用户切走 tab 后回来,无需等下一次 2.5s 轮询即可看到最新进度。
  useEffect(() => {
    if (!jobId) return;
    function onVisible() {
      if (document.visibilityState === "visible") {
        fetchJobView();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [jobId, fetchJobView]);

  // tab 标题随生成进度变化（仅 generating 阶段）：
  // 让用户切走 tab 时,在浏览器标签页就能看到 "(50%) SceneSelf — generating..." 之类的进度。
  useEffect(() => {
    if (step !== "generating") {
      document.title = "SceneSelf — One selfie, a full scene set";
      return;
    }
    const total = 6;
    const ready = jobView?.frames?.filter(f => f.imageUrl).length ?? 0;
    const pct = Math.round((ready / total) * 100);
    document.title =
      ready > 0
        ? `(${pct}%) SceneSelf — generating...`
        : "SceneSelf — preparing your scene...";
    return () => {
      document.title = "SceneSelf — One selfie, a full scene set";
    };
  }, [step, jobView?.frames]);

  // 通过 ?job=<id> 直接加载某次生成的结果（可分享 / 回看）
  useEffect(() => {
    const jid = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("job") : null;
    if (!jid) return;
    setJobId(jid);
    api
      .fetchJob(jid)
      .then(v => {
        setJobView(v);
        setStep(v.job.status === "completed" || v.job.status === "partial" ? "result" : "generating");
      })
      .catch(() => {});
  }, []);

  const reset = () => {
    setStep("upload");
    setRawPrompt("");
    setClarify(null);
    setAnswers({});
    setOtherOpen({});
    setScenePlan(null);
    setJobId(null);
    setJobView(null);
    setError(null);
    setLightboxIndex(null);
    setConfirmedOwn(false);
  };

  // answers 只存 {tone, focus} 两键;otherOpen[key]=true 时 answers[key] 是自由文本(可空=未填)。
  const toneAnswered = (answers.tone ?? "").trim().length > 0;
  const focusAnswered = (answers.focus ?? "").trim().length > 0;

  const shots = scenePlan?.shots ?? [];
  const frameByIndex = useMemo(
    () => new Map((jobView?.frames ?? []).map(f => [f.index, f])),
    [jobView],
  );
  const resultFrames = (jobView?.frames ?? []).filter(f => f.imageUrl);
  const stepIndex = FLOW.indexOf(step);

  // 登录加载态（暗房风格）
  if (session.isPending || (!session.data && step !== "result")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0a09]">
        <Loader2 className="h-7 w-7 animate-spin text-amber-200/70" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c0a09] text-stone-100">
      {/* golden-hour 光晕 */}
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[70vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,178,120,0.20),rgba(12,10,9,0)_70%)]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[50vh] w-[60vh] bg-[radial-gradient(closest-side,rgba(232,130,90,0.10),transparent)]" />
      {/* 胶片颗粒 */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-5 pb-12 pt-7">
        {/* 品牌 + 进度 */}
        <header className="mb-7">
          <div className="flex items-center justify-between">
            <span className={`${display.className} text-lg tracking-tight text-stone-200`}>
              Scene<span className="italic text-amber-300/90">Self</span>
            </span>
            {step !== "generating" && step !== "result" && (
              <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
                {t(`steps.${FLOW[Math.max(0, stepIndex)]}`)}
              </span>
            )}
          </div>
          {stepIndex >= 0 && (
            <div className="mt-4 flex gap-1.5">
              {FLOW.map((s, i) => (
                <div
                  key={s}
                  className={`h-[3px] flex-1 rounded-full transition-colors duration-500 ${
                    i <= stepIndex ? "bg-amber-300/80" : "bg-white/10"
                  }`}
                />
              ))}
            </div>
          )}
        </header>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = "";
          }}
        />

        <main className="flex flex-1 flex-col">
          <AnimatePresence mode="wait">
            {/* ── UPLOAD ── */}
            {step === "upload" && (
              <motion.section key="upload" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-1 flex-col">
                <h1 className={`${display.className} text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>{t("upload.title")}</h1>
                <p className="mt-3 text-sm leading-relaxed text-stone-400">{t("upload.subtitle")}</p>

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="group relative mt-7 aspect-[4/5] w-full overflow-hidden rounded-3xl border border-dashed border-white/15 bg-white/[0.02] transition-colors hover:border-amber-300/40"
                >
                  {selfiePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selfiePreview} alt="selfie" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-4 text-stone-400">
                      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-transform group-hover:scale-105">
                        <Camera className="h-7 w-7" />
                      </span>
                      <span className="text-sm font-medium text-stone-300">{t("upload.cta")}</span>
                      <span className="text-xs text-stone-500">{t("upload.hint")}</span>
                    </span>
                  )}
                  {uploading && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                      <Loader2 className="h-7 w-7 animate-spin text-amber-200" />
                    </span>
                  )}
                </button>

                {error && <ErrorLine text={error} />}

                <div className="mt-auto pt-7">
                  {selfieUrl && (
                    <label className="mt-4 flex items-start gap-2 text-xs text-stone-400">
                      <input type="checkbox" checked={confirmedOwn} onChange={e => setConfirmedOwn(e.target.checked)} className="mt-0.5 accent-amber-300" />
                      <span>{t("upload.confirmOwn")}</span>
                    </label>
                  )}
                  <div className="mt-4">
                    <PrimaryButton disabled={!selfieUrl || uploading || !confirmedOwn} onClick={() => setStep("describe")}>
                      {t("upload.continue")} <ArrowRight className="h-4 w-4" />
                    </PrimaryButton>
                  </div>
                </div>
              </motion.section>
            )}

            {/* ── DESCRIBE ── */}
            {step === "describe" && (
              <motion.section key="describe" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-1 flex-col">
                <BackButton onClick={() => setStep("upload")} label={t("back")} />
                <h1 className={`${display.className} mt-4 text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>{t("describe.title")}</h1>
                <p className="mt-3 text-sm text-stone-400">{t("describe.subtitle")}</p>

                <textarea
                  value={rawPrompt}
                  onChange={e => setRawPrompt(e.target.value)}
                  placeholder={t("describe.placeholder")}
                  rows={3}
                  className="mt-6 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-base text-stone-100 outline-none ring-amber-300/0 transition focus:border-amber-300/30 focus:ring-2 focus:ring-amber-300/20 placeholder:text-stone-600"
                />

                <p className="mt-6 text-xs uppercase tracking-[0.18em] text-stone-500">{t("describe.examplesLabel")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibleChips.map(k => {
                    const label = t(`describe.chips.${k}`);
                    return (
                      <button key={k} type="button" onClick={() => setRawPrompt(label)} className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-2 text-sm text-stone-300 transition hover:border-amber-300/40 hover:text-amber-100">
                        {label}
                      </button>
                    );
                  })}
                </div>

                {error && <ErrorLine text={error} />}

                <div className="mt-auto pt-7">
                  <PrimaryButton disabled={!rawPrompt.trim() || busy} onClick={submitDescribe}>
                    {busy ? (<><Loader2 className="h-4 w-4 animate-spin" /> {t("describe.thinking")}</>) : (<><Sparkles className="h-4 w-4" /> {t("describe.submit")}</>)}
                  </PrimaryButton>
                </div>
              </motion.section>
            )}

            {/* ── Q1 TONE(rejected 兜底也走这屏)── */}
            {step === "tone" && (
              <motion.section key="tone" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-1 flex-col">
                <BackButton onClick={() => setStep("describe")} label={t("back")} />

                {clarify?.rejected ? (
                  <div className="mt-4">
                    <h1 className={`${display.className} text-[1.9rem] font-medium leading-tight text-stone-50`}>{t("clarify.rejectedTitle")}</h1>
                    <p className="mt-3 text-sm text-stone-400">{t("clarify.rejectedBody")}</p>
                    <div className="mt-5 flex flex-col gap-2.5">
                      {clarify.rejected.safeRewriteChips.map(chip => (
                        <button key={chip} type="button" onClick={() => { setRawPrompt(chip); setStep("describe"); }} className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3.5 text-left text-sm text-amber-100 transition hover:bg-amber-300/[0.12]">
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ToneStep
                    t={t}
                    displayClass={display.className}
                    suggestions={clarify?.tone_suggestions ?? []}
                    selected={answers.tone}
                    otherOpen={!!otherOpen.tone}
                    wasTranslated={!!clarify?.wasTranslated}
                    rewriteApplied={!!clarify?.rewriteApplied}
                    onPick={(toneId) => { setOtherOpen(o => ({ ...o, tone: false })); setAnswers(a => ({ ...a, tone: toneId })); }}
                    onPickOther={() => { if (otherOpen.tone) return; setOtherOpen(o => ({ ...o, tone: true })); setAnswers(a => ({ ...a, tone: "" })); }}
                    onOtherText={(v) => setAnswers(a => ({ ...a, tone: v }))}
                    onNext={() => setStep("focus")}
                    canNext={toneAnswered}
                  />
                )}
              </motion.section>
            )}

            {/* ── Q2 FOCUS ── */}
            {step === "focus" && (
              <motion.section key="focus" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-1 flex-col">
                <BackButton onClick={() => setStep("tone")} label={t("back")} />
                {/* canSubmit 的 toneAnswered 项:tone 已在上一屏 gate(canNext),此处属防御性冗余,保留以防流程跳转绕过 */}
                <FocusStep
                  t={t}
                  displayClass={display.className}
                  storylineType={clarify?.storyline_type ?? "journey"}
                  options={clarify?.focus_options ?? []}
                  selected={answers.focus}
                  otherOpen={!!otherOpen.focus}
                  onPick={(focusId) => { setOtherOpen(o => ({ ...o, focus: false })); setAnswers(a => ({ ...a, focus: focusId })); }}
                  onPickOther={() => { if (otherOpen.focus) return; setOtherOpen(o => ({ ...o, focus: true })); setAnswers(a => ({ ...a, focus: "" })); }}
                  onOtherText={(v) => setAnswers(a => ({ ...a, focus: v }))}
                  onSubmit={submitClarify}
                  canSubmit={toneAnswered && focusAnswered}
                  error={error}
                />
              </motion.section>
            )}

            {/* ── GENERATING（自拍显影等待页）── */}
            {step === "generating" && (
              <GeneratingView
                key="generating"
                t={t}
                shots={shots}
                frameByIndex={frameByIndex}
                selfiePreview={selfiePreview}
                displayClass={display.className}
                setupError={setupError}
                onBack={backToClarifyFromGenerating}
              />
            )}

            {/* ── RESULT ── */}
            {step === "result" && (() => {
              const usedCredits = jobView?.job.creditsCost ?? 0;
              const dropped = jobView?.job.droppedCount ?? 0;
              // 与后端 refundForUndelivered 保持同源:dropped × 50 × 2 ("Double" 承诺)。
              // 改倍数请只改 pricing.ts 的 UNDELIVERED_REFUND_MULTIPLIER,UI 自动跟上。
              const refunded = dropped * CREDITS_PER_PHOTO * UNDELIVERED_REFUND_MULTIPLIER;
              return (
              <motion.section key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
                <h1 className={`${display.className} text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>{t("result.title")}</h1>

                {dropped > 0 && (
                  <div className="mt-5 rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/[0.10] to-orange-300/[0.05] px-5 py-4">
                    <p className="text-[13px] leading-relaxed text-amber-50 sm:text-sm">
                      {t.rich("result.compensation", {
                        used: usedCredits,
                        dropped,
                        refunded,
                        b: (chunks) => <span className="font-semibold text-amber-100">{chunks}</span>,
                        Double: (chunks) => (
                          <em className={`${display.className} text-base font-semibold not-italic text-amber-300 sm:text-lg`}>{chunks}</em>
                        ),
                      })}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-sm text-stone-400">{jobView?.job.status === "partial" ? t("result.subtitlePartial") : t("result.subtitle")}</p>

                <div className={`mt-7 grid gap-3 ${resultFrames.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {resultFrames.map((f, i) => (
                    <button key={f.index} type="button" onClick={() => setLightboxIndex(i)} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.imageUrl ?? ""} alt={f.narrativeRole ?? ""} className="h-full w-full object-cover" />
                      {f.isCover && (
                        <span className="absolute left-2 top-2 rounded-full bg-amber-300/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-900">{t("result.cover")}</span>
                      )}
                      <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
                    </button>
                  ))}
                </div>

                <div className="mt-8 space-y-3">
                  <DownloadAllButton
                    frames={resultFrames}
                    prompt={jobView?.job.safePrompt ?? "scene"}
                    label={t("result.downloadAll")}
                    sharingLabel={t("result.sharing")}
                  />
                  <PrimaryButton onClick={reset}>
                    <RotateCcw className="h-4 w-4" /> {t("result.again")}
                  </PrimaryButton>
                </div>

                {lightboxIndex !== null && resultFrames[lightboxIndex] && (
                  <Lightbox
                    t={t}
                    frames={resultFrames}
                    index={lightboxIndex}
                    onIndex={setLightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                  />
                )}
              </motion.section>
              );
            })()}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ── 等待页：自拍显影 + 阶段话术 + 真实帧接管 ──
// 支持三个生命阶段：
//   (A) plan/createJob 阶段（shots 还没回来，jobId 还没拿到）→ 渲染 6 个无 narrative 的占位
//   (B) 生成阶段（jobId 已到，frames 在生成）→ 占位带 narrative_role
//   (C) 部分就绪 → 已就绪 cell 翻牌，剩余继续显影
function GeneratingView({
  t,
  shots,
  frameByIndex,
  selfiePreview,
  displayClass,
  setupError,
  onBack,
}: {
  t: ReturnType<typeof useTranslations>;
  shots: ScenePlan["shots"];
  frameByIndex: Map<number, JobView["frames"][number]>;
  selfiePreview: string | null;
  displayClass: string;
  setupError: string | null;
  onBack: () => void;
}) {
  const TOTAL = 6;
  const [elapsed, setElapsed] = useState(0);
  const readyCount = shots.filter(s => frameByIndex.get(s.index)?.imageUrl).length;

  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // （旧 stages/stageIdx 话术由新版 ProgressLadder 直接展开 5 步取代）

  // 渲染用的 shots：实际 shots 若空（plan 还没回）则给 6 个占位 stub
  const renderShots: Array<{ index: number; narrativeRole?: string | null }> =
    shots.length > 0
      ? shots
      : Array.from({ length: TOTAL }, (_, i) => ({ index: i + 1, narrativeRole: null }));

  if (setupError) {
    return (
      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
        <h1 className={`${displayClass} text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>{t("generating.errorTitle")}</h1>
        <p className="mt-3 text-sm text-stone-400">{setupError}</p>
        <div className="mt-auto pt-7">
          <button
            type="button"
            onClick={onBack}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-6 py-4 text-[15px] font-semibold text-amber-100 transition hover:bg-amber-300/20"
          >
            <ArrowLeft className="h-4 w-4" /> {t("generating.backToEdit")}
          </button>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
      {/* SVG 颗粒滤镜（DevelopingCell 共用，集中定义） */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <filter id="ss-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.96  0 0 0 0 0.78  0 0 0 0 0.55  0 0 0 0.85 0" />
          </filter>
          <filter id="ss-grain-fine" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="1" seed="7" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 0" />
          </filter>
        </defs>
      </svg>

      <h1 className={`${displayClass} text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>{t("generating.title")}</h1>

      {/* 6 张图（顶部）—— 顺序：6 图 → 阶梯进度 → 整体进度条 → 耐心提示 */}
      <div className={`mt-6 grid gap-3 ${TOTAL > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
        {renderShots.map((shot, i) => {
          const f = frameByIndex.get(shot.index);
          return (
            <DevelopingCell
              key={shot.index}
              frameIndex={shot.index}
              total={TOTAL}
              url={f?.imageUrl ?? null}
              cover={!!f?.isCover}
              selfiePreview={selfiePreview}
              delaySec={i * 0.35}
              elapsed={elapsed}
              narrativeRole={f?.narrativeRole ?? shot.narrativeRole ?? null}
              coverLabel={t("generating.cover")}
              developingLabel={t("generating.developing")}
            />
          );
        })}
      </div>

      {/* 阶梯进度（6 图下方）：5 步顺序展开 + 每步横向 bar */}
      <ProgressLadder
        t={t}
        elapsed={elapsed}
        readyCount={readyCount}
        totalCount={TOTAL}
      />

      {/* 整体进度条（最下面，120s 推 99%；全部就绪则提前 100%） */}
      <OverallProgress elapsed={elapsed} readyCount={readyCount} totalCount={TOTAL} />

      {/* 耐心提示：移到最下面 — 不写秒数，强调"质量胜过速度" */}
      <div className="mt-5 rounded-2xl border border-amber-200/15 bg-amber-200/[0.04] px-4 py-3 text-[13px] leading-relaxed text-amber-100/85 sm:text-sm">
        {t("generating.patience")}
      </div>
    </motion.section>
  );
}

// 阶梯进度（5 步顺序展开）：用户产品要求 —
// - 一项跑完才显示下一项（不是 5 步全展示等高）
// - 每步用横向 bar 从 0→100% 推进
// - 时长配置:[20s, 20s, 20s, 30s, 30s] 累积 = [20, 40, 60, 90, 120]
// - 第 4 步「生成你的照片」:首图就绪(readyCount>=1) → 立即跳完
// - 第 5 步「精修」:全部就绪(readyCount==totalCount) → 100%;否则推到 99% 卡住
// - 整体已 120s+ 仍未全就绪:全部步骤推满到 99%（OverallProgress 会卡 99%）
const STEP_DURATIONS = [20, 20, 20, 30, 30] as const; // 秒
const STEP_KEYS = ["analyzing", "building", "setting", "generating", "polishing"] as const;

function ProgressLadder({
  t,
  elapsed,
  readyCount,
  totalCount,
}: {
  t: ReturnType<typeof useTranslations>;
  elapsed: number;
  readyCount: number;
  totalCount: number;
}) {
  const allReady = totalCount > 0 && readyCount >= totalCount;
  const firstReady = readyCount >= 1;

  // 计算每步状态：done / active / hidden
  // 累积时间点：cumStart[i] = sum(STEP_DURATIONS[0..i-1])
  const cumStart: number[] = [0];
  for (let i = 0; i < STEP_DURATIONS.length; i++) {
    cumStart.push(cumStart[i] + STEP_DURATIONS[i]);
  }

  // 普通时间分配下当前是哪一步
  let timeCurrentIdx = STEP_DURATIONS.length - 1;
  for (let i = 0; i < STEP_DURATIONS.length; i++) {
    if (elapsed < cumStart[i + 1]) {
      timeCurrentIdx = i;
      break;
    }
  }

  // 真实帧反馈覆盖时间：
  //  - 首图就绪：至少跳到第 5 步（"polishing"），把 1-4 全标 done
  //  - 全部就绪：5 步全 done
  let currentIdx = timeCurrentIdx;
  if (firstReady) currentIdx = Math.max(currentIdx, 4);
  if (allReady) currentIdx = STEP_KEYS.length; // 越界 → 所有都 done

  return (
    <ul className="mt-7 space-y-3">
      {STEP_KEYS.map((key, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        // 顺序展开：未到的步骤直接不渲染
        if (!done && !active) return null;

        // 计算当前步进度 %
        let pct: number;
        if (done) {
          pct = 100;
        } else {
          // active 步
          const stepStart = cumStart[i];
          const stepDur = STEP_DURATIONS[i];
          const stepElapsed = Math.max(0, elapsed - stepStart);
          if (i === 4) {
            // 第 5 步：30s 推到 99%，allReady → 100%
            pct = allReady ? 100 : Math.min(99, (stepElapsed / stepDur) * 99);
          } else if (i === 3) {
            // 第 4 步：30s 推满，firstReady 跳完（已被 currentIdx 处理，不会走到这里）
            pct = Math.min(100, (stepElapsed / stepDur) * 100);
          } else {
            // 1-3 步：20s 推满
            pct = Math.min(100, (stepElapsed / stepDur) * 100);
          }
        }

        return (
          <li key={key} className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border transition-colors ${
                  done
                    ? "border-amber-300 bg-amber-300 text-stone-900"
                    : "border-amber-300/70 bg-amber-300/10"
                }`}
                aria-hidden
              >
                {done ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : (
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-200" />
                )}
              </span>
              <span className={`text-[13px] leading-tight transition-colors sm:text-sm ${active ? "font-medium text-amber-100" : "text-amber-100/60"}`}>
                {t(`generating.steps.${key}`)}
              </span>
            </div>
            {/* 横向 bar */}
            <div className="ml-6 h-1 overflow-hidden rounded-full bg-stone-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-300 transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// 整体进度条（最下面）：120s 推到 99%，全部就绪 → 100%。
// 即使 elapsed > 120 也卡 99%，让用户知道还在跑。
function OverallProgress({
  elapsed,
  readyCount,
  totalCount,
}: {
  elapsed: number;
  readyCount: number;
  totalCount: number;
}) {
  const TOTAL_SEC = 120;
  const allReady = totalCount > 0 && readyCount >= totalCount;
  const pct = allReady ? 100 : Math.min(99, (elapsed / TOTAL_SEC) * 99);
  return (
    <div className="mt-6 space-y-1.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-stone-500">
        <span>{readyCount}/{totalCount}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// 单格：模拟胶片在显影液里逐渐显形 — 多层视觉协同制造"马上要好"的感觉：
//   1. 帧编号 + 帧名（让用户看到每张在拍什么）
//   2. 自拍模糊底（暗示"在冲洗你的照片"）
//   3. 双层颗粒（高密度 + 高对比，胶片噪点）
//   4. 暖光潮汐（从底部上涌的显影液琥珀光）
//   5. 中心曝光光晕（呼吸感）
//   6. 顶部独立"显影进度"细条（每帧自己的工艺感节奏）
//   7. 扫光 beam（每隔几秒从上到下扫过，模仿显影液面波动）
//   8. 底部"DEVELOPING"状态条 + 闪烁灯
//   完成时翻牌（blur→clear + scale + 金光闪 + 颗粒消散）
function DevelopingCell({
  frameIndex,
  total,
  url,
  cover,
  selfiePreview,
  delaySec,
  elapsed,
  narrativeRole,
  coverLabel,
  developingLabel,
}: {
  frameIndex: number;
  total: number;
  url: string | null;
  cover: boolean;
  selfiePreview: string | null;
  delaySec: number;
  elapsed: number;
  narrativeRole: string | null;
  coverLabel: string;
  developingLabel: string;
}) {
  // 颗粒衰减：6s 起 0.65 → 0.18 之间脉动；35s 后稳定低位。
  const grainBase = elapsed < 35 ? 0.65 - Math.min(0.47, elapsed * 0.013) : 0.18;
  // 每帧独立"显影进度"：错开起点，让 6 个进度条节奏不同步（更有"6 张同时在做事"的感觉）。
  // 每帧约 28s 跑完一轮，循环往复（真实帧到位即接管）。
  const indCycleSec = 28;
  const indOffset = delaySec * 2;
  const indPct = ((elapsed + indOffset) % indCycleSec) / indCycleSec;
  const indWidth = `${Math.round(indPct * 100)}%`;
  // 帧编号 01..06
  const idLabel = String(frameIndex).padStart(2, "0");
  const totalLabel = String(total).padStart(2, "0");

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-amber-100/8 bg-[#15110e] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6),inset_0_0_30px_-12px_rgba(255,180,110,0.18)]">
      {url ? (
        // 完成翻牌：blur → clear + scale 收回 + 金光闪一下覆盖层
        <motion.div
          initial={{ opacity: 0, filter: "blur(20px)", scale: 1.06 }}
          animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative h-full w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={narrativeRole ?? ""} className="h-full w-full object-cover" />
          {/* 完成瞬间一道金光从上而下擦过 */}
          <motion.div
            className="pointer-events-none absolute inset-x-0 -top-1/3 h-1/2"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,221,160,0) 0%, rgba(255,221,160,0.55) 50%, rgba(255,221,160,0) 100%)",
              mixBlendMode: "screen",
            }}
            initial={{ y: "-40%", opacity: 0.85 }}
            animate={{ y: "260%", opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />
          {cover && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-300/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-stone-900">
              {coverLabel}
            </span>
          )}
        </motion.div>
      ) : (
        <>
          {/* 1. 自拍模糊底——让用户感觉冲洗的是"自己的照片" */}
          {selfiePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selfiePreview}
              alt=""
              className="absolute inset-0 h-full w-full scale-[1.4] object-cover opacity-35 blur-[30px]"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(245,178,120,0.18),transparent_70%)]" />
          )}

          {/* 2. 显影液琥珀深底 */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-950/45 via-stone-950/30 to-black/65" />

          {/* 3. 颗粒（粗 + 细两层），密度随时间衰减；不依赖 SVG 滤镜，用 data-uri 噪点 + repeat 更稳 */}
          <motion.div
            className="absolute inset-0"
            style={{
              filter: "url(#ss-grain)",
              mixBlendMode: "overlay" as const,
            }}
            animate={{ opacity: [grainBase + 0.12, grainBase, grainBase + 0.12] }}
            transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut", delay: delaySec }}
          />
          <motion.div
            className="absolute inset-0"
            style={{
              filter: "url(#ss-grain-fine)",
              mixBlendMode: "screen" as const,
            }}
            animate={{
              opacity: [Math.max(0.1, grainBase * 0.35), Math.max(0.06, grainBase * 0.22), Math.max(0.1, grainBase * 0.35)],
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: delaySec * 1.3 }}
          />
          {/* 静态背景颗粒（fallback；用 screen blend 在暗底上能浮起暖色噪点，给胶片感） */}
          <div
            className="absolute inset-0 opacity-[0.42] mix-blend-screen"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 0.82  0 0 0 0 0.55  0 0 0 0.95 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
          {/* 第二层更细的颗粒（高频）+ 缓动 opacity，进一步增强胶片噪点感 */}
          <motion.div
            className="absolute inset-0 mix-blend-screen"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='n2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.6' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.92  0 0 0 0.7 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n2)'/%3E%3C/svg%3E\")",
            }}
            animate={{ opacity: [0.18, 0.32, 0.18] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: delaySec * 1.6 }}
          />

          {/* 4. 暖光潮汐：从底部漂浮上来的琥珀光，模仿显影液浮力 */}
          <motion.div
            className="absolute inset-x-0 bottom-0 h-[140%]"
            style={{
              background:
                "radial-gradient(85% 55% at 50% 100%, rgba(255,196,120,0.38) 0%, rgba(255,160,90,0.22) 35%, rgba(0,0,0,0) 70%)",
            }}
            animate={{ y: ["6%", "-14%", "6%"], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: delaySec }}
          />

          {/* 5. 中心呼吸光晕（暗示"正在曝光成像"） */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(55% 45% at 50% 42%, rgba(255,220,160,0.28) 0%, rgba(255,180,110,0.10) 45%, transparent 75%)",
            }}
            animate={{ opacity: [0.5, 0.95, 0.5], scale: [0.95, 1.06, 0.95] }}
            transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut", delay: delaySec * 0.7 }}
          />

          {/* 6. 扫光 beam：每隔 6s 一次从上向下扫过，模仿显影液面波 */}
          <motion.div
            className="pointer-events-none absolute inset-x-0 h-[35%]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,231,180,0) 0%, rgba(255,221,160,0.42) 50%, rgba(255,231,180,0) 100%)",
              mixBlendMode: "screen",
              filter: "blur(2px)",
            }}
            initial={{ y: "-50%", opacity: 0 }}
            animate={{ y: ["-50%", "150%"], opacity: [0, 0.85, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: delaySec * 2.2, repeatDelay: 3.4 }}
          />

          {/* 7. 微抖动（imperceptible，但能让一组占位"活"起来） */}
          <motion.div
            className="absolute inset-0"
            animate={{ x: [0, 0.7, -0.5, 0], y: [0, -0.4, 0.6, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: delaySec * 1.7 }}
          />

          {/* 8. 帧编号角标 + 旁边一个旋转 spinner，强化"该格正在加工"感 */}
          <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-black/45 px-1.5 py-0.5 backdrop-blur-sm">
            <motion.span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full border border-amber-300/70 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: delaySec * 0.5 }}
            />
            <span className="text-[10px] font-semibold text-amber-100 tabular-nums tracking-wider">{idLabel}</span>
            <span className="text-[9px] text-amber-100/50 tabular-nums">/ {totalLabel}</span>
          </div>

          {/* 9. 顶部"显影进度"独立粗条（每帧自己的工艺感节奏）*/}
          <div className="absolute inset-x-2 top-9 z-10 h-[2.5px] overflow-hidden rounded-full bg-amber-100/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-200/80 via-orange-300 to-amber-200/80 shadow-[0_0_6px_rgba(252,211,77,0.6)] transition-[width] duration-700 ease-linear"
              style={{ width: indWidth }}
            />
          </div>

          {/* 10. 底部状态条：narrative_role / DEVELOPING + 脉冲灯 */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 bg-gradient-to-t from-black/72 via-black/35 to-transparent px-2.5 pb-2 pt-7">
            <span className="line-clamp-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/90">
              {narrativeRole ?? developingLabel}
            </span>
            <motion.span
              className="inline-flex h-1.5 w-1.5 flex-none rounded-full bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.55)]"
              animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.25, 0.85] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut", delay: delaySec }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// Q1/Q2 共用的"其他—自由描述"块:虚线按钮(展开态金色)+ 展开后输入框。
// 抽出共享:消除两处长 className 重复(防 Q1/Q2 视觉漂移)、集中 aria-pressed 展开态。
function OtherInput({
  open,
  value,
  onOpen,
  onChange,
  label,
  placeholder,
}: {
  open: boolean;
  value: string;
  onOpen: () => void;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={open}
        className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed px-3.5 py-3 text-sm transition ${
          open ? "border-amber-300/60 bg-amber-300/[0.06] text-amber-100" : "border-white/15 bg-transparent text-stone-400 hover:border-white/30"
        }`}
      >
        <Pencil className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <input
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-2.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-300/30 focus:ring-2 focus:ring-amber-300/20 placeholder:text-stone-600"
        />
      )}
    </>
  );
}

function ToneStep({
  t,
  displayClass,
  suggestions,
  selected,
  otherOpen,
  wasTranslated,
  rewriteApplied,
  onPick,
  onPickOther,
  onOtherText,
  onNext,
  canNext,
}: {
  t: ReturnType<typeof useTranslations>;
  displayClass: string;
  suggestions: string[];
  selected: string | undefined;
  otherOpen: boolean;
  wasTranslated: boolean;
  rewriteApplied: boolean;
  onPick: (toneId: string) => void;
  onPickOther: () => void;
  onOtherText: (v: string) => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <>
      <h1 className={`${displayClass} mt-4 text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>
        {t("clarify.tone.title")}
      </h1>
      <p className="mt-3 text-sm text-stone-400">{t("clarify.tone.subtitle")}</p>
      {wasTranslated && (
        <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3.5 py-2.5 text-xs text-amber-200/90">
          {t("clarify.translatedNotice")}
        </p>
      )}
      {rewriteApplied && (
        <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3.5 py-2.5 text-xs text-amber-200/90">
          {t("clarify.rewriteNotice")}
        </p>
      )}
      {suggestions.length > 0 && (
        <p className="mt-5 text-xs uppercase tracking-[0.15em] text-amber-300/80">
          {t("clarify.tone.aiHint")}
        </p>
      )}

      {/* 8 个调性 2 列卡片 */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {SCENE_TONES.map(tone => {
          const isSuggested = suggestions.includes(tone.id);
          const isActive = !otherOpen && selected === tone.id;
          // 推荐项不再描金边(避免被误以为"已选");只有用户真正点选才出现 active 金边。
          const ring = isActive
            ? "border-amber-300 bg-amber-300/15 text-amber-100"
            : "border-white/10 bg-white/[0.02] text-stone-200 hover:border-white/25";
          return (
            <button
              key={tone.id}
              type="button"
              onClick={() => onPick(tone.id)}
              aria-pressed={isActive}
              className={`relative flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${ring}`}
            >
              {isSuggested && (
                <span className="absolute right-2 top-2 rounded-full bg-amber-300/90 px-1.5 py-[1px] text-[9px] font-bold tracking-wide text-stone-900">
                  {t("clarify.tone.aiBadge")}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="text-[18px] leading-none">{tone.emoji}</span>
                <span className="text-[13px] font-semibold leading-tight">{t(`tones.${tone.id}.label`)}</span>
              </span>
              <span className="text-[11px] leading-tight text-stone-400">{t(`tones.${tone.id}.hint`)}</span>
            </button>
          );
        })}
      </div>

      {/* Other 兜底(共享组件) */}
      <OtherInput
        open={otherOpen}
        value={selected ?? ""}
        onOpen={onPickOther}
        onChange={onOtherText}
        label={t("clarify.other")}
        placeholder={t("clarify.otherPlaceholder")}
      />

      <div className="mt-auto pt-6">
        <PrimaryButton disabled={!canNext} onClick={onNext}>
          {t("clarify.tone.next")} <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </>
  );
}

function FocusStep({
  t,
  displayClass,
  storylineType,
  options,
  selected,
  otherOpen,
  onPick,
  onPickOther,
  onOtherText,
  onSubmit,
  canSubmit,
  error,
}: {
  t: ReturnType<typeof useTranslations>;
  displayClass: string;
  storylineType: string;
  options: { id: string; label: string }[];
  selected: string | undefined;
  otherOpen: boolean;
  onPick: (focusId: string) => void;
  onPickOther: () => void;
  onOtherText: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  error: string | null;
}) {
  // 侧重 label 优先走 i18n 字典(scene.focus.<type>.<id>);缺 key 时 next-intl 返回 key 本身,
  // 此时回退到后端返回的 label,避免显示原始 key 字符串。
  const labelFor = (id: string, backendLabel: string) => {
    const key = `focus.${storylineType}.${id}`;
    const v = t(key);
    return v && v !== key ? v : backendLabel;
  };

  return (
    <>
      <h1 className={`${displayClass} mt-4 text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>
        {t("clarify.focus.title")}
      </h1>
      <p className="mt-3 text-sm text-stone-400">{t("clarify.focus.subtitle")}</p>

      {/* 4 卡 2 列(若 3 项 → 自然换行) */}
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {options.map(opt => {
          const active = !otherOpen && selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onPick(opt.id)}
              aria-pressed={active}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3.5 py-4 text-left transition ${
                active
                  ? "border-amber-300 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-white/[0.02] text-stone-200 hover:border-white/25"
              }`}
            >
              <span className="text-sm font-semibold leading-tight">{labelFor(opt.id, opt.label)}</span>
            </button>
          );
        })}
      </div>

      {/* Other 兜底(共享组件) */}
      <OtherInput
        open={otherOpen}
        value={selected ?? ""}
        onOpen={onPickOther}
        onChange={onOtherText}
        label={t("clarify.other")}
        placeholder={t("clarify.otherPlaceholder")}
      />

      {error && <ErrorLine text={error} />}

      <div className="mt-auto pt-6">
        <PrimaryButton disabled={!canSubmit} onClick={onSubmit}>
          <Sparkles className="h-4 w-4" /> {t("clarify.start")}
        </PrimaryButton>
      </div>
    </>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-200 to-orange-300 px-6 py-4 text-[15px] font-semibold text-stone-900 shadow-[0_8px_30px_-8px_rgba(245,178,120,0.5)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none">
      {children}
    </button>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="-ml-1 flex w-fit items-center gap-1 text-sm text-stone-500 transition hover:text-stone-300">
      <ArrowLeft className="h-4 w-4" />
    </button>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
      {text}
    </motion.p>
  );
}

// 结果页放大查看:全屏 overlay + 左右切换 + 下载 + ESC/箭头键。
// index 是 frames(=resultFrames)数组下标;onIndex 切换,onClose 关闭。
function Lightbox({
  t,
  frames,
  index,
  onIndex,
  onClose,
}: {
  t: ReturnType<typeof useTranslations>;
  frames: JobView["frames"];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const f = frames[index];
  const go = useCallback(
    (delta: number) => onIndex((index + delta + frames.length) % frames.length),
    [index, frames.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!f) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("result.close")}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {frames.length > 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); go(-1); }}
          aria-label={t("result.prev")}
          className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <div onClick={e => e.stopPropagation()} className="relative max-h-[82vh] w-auto max-w-[90vw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.imageUrl ?? ""} alt={f.narrativeRole ?? ""} className="max-h-[82vh] w-auto max-w-[90vw] rounded-2xl object-contain" />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs tabular-nums text-stone-400">{index + 1} / {frames.length}</span>
          <a
            href={f.imageUrl ?? "#"}
            download={`sceneself-${f.index}.jpg`}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
          >
            <Download className="h-4 w-4" /> {t("result.download")}
          </a>
        </div>
      </div>

      {frames.length > 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); go(1); }}
          aria-label={t("result.next")}
          className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </motion.div>
  );
}
