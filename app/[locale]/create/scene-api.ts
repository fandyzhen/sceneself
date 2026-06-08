// 创作流 client 端 fetch 封装与视图类型。
import type { ScenePlan, RewriteReason, StorylineType } from "@/lib/scene/types";

export interface ClarifyResult {
  safePrompt?: string;
  rewriteApplied?: boolean;
  rewriteReason?: RewriteReason;
  userNotice?: string;
  /** 用户输入归到的故事线类型（8 类之一） */
  storyline_type?: StorylineType;
  /** AI 预选高亮的调性 id（1-2 个，匹配 SCENE_TONES） */
  tone_suggestions?: string[];
  /** Q2 体验侧重选项（该故事线类型专属，后端常量驱动） */
  focus_options?: { id: string; label: string }[];
  rejected?: { reason: string; userMessage: string; safeRewriteChips: string[] };
  error?: string;
  /** 用户输入的原始语言（"en" 表示无翻译；非 en 时可能附带 wasTranslated） */
  originalLanguage?: "en" | "zh" | "ja" | "ko" | "other";
  /** 是否真正发生了翻译（用于前端展示"已自动翻译"提示） */
  wasTranslated?: boolean;
}

export type FrameViewStatus = "pending" | "generating" | "passed" | "swapped" | "failed";

export interface FrameView {
  index: number;
  status: FrameViewStatus;
  imageUrl: string | null;
  isCover: boolean;
  narrativeRole: string | null;
  summary: string | null;
  /** 展示用一句话场景概述（弹幕 + lightbox），跟随用户输入语言 */
  caption: string | null;
}

export interface JobView {
  job: {
    id: string;
    status: "draft" | "planning" | "awaiting_choices" | "generating" | "completed" | "partial" | "failed";
    tier: string;
    shotCount: number;
    title: string | null;
    aspectRatio: string;
    safePrompt?: string | null;
    creditsCost?: number;
    /** dropped 帧数（dropped 帧自身不返回，仅用于"补偿提示"显示） */
    droppedCount?: number;
  };
  frames: FrameView[];
}

export async function uploadSelfie(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/scene/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("upload_failed");
  const data = (await res.json()) as { url?: string; ok?: boolean; faceIssue?: string };
  if (data.ok === false && data.faceIssue) {
    const err = new Error("face_check_failed") as Error & { faceIssue?: string };
    err.faceIssue = data.faceIssue;
    throw err;
  }
  return data.url!;
}

export async function clarifyScene(rawPrompt: string): Promise<ClarifyResult> {
  const res = await fetch("/api/scene/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawPrompt }),
  });
  return (await res.json()) as ClarifyResult;
}

export async function planScene(
  safePrompt: string,
  answers: Record<string, string>,
  rawPrompt?: string,
): Promise<{ scenePlan?: ScenePlan; error?: string }> {
  const res = await fetch("/api/scene/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ safePrompt, answers, rawPrompt }),
  });
  return (await res.json()) as { scenePlan?: ScenePlan; error?: string };
}

export async function createSceneJob(input: {
  selfieUrl: string;
  scenePlan: ScenePlan;
  safePrompt?: string;
}): Promise<{ jobId?: string; error?: string; code?: string }> {
  const res = await fetch("/api/scene/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await res.json()) as { jobId?: string; error?: string; code?: string };
}

export async function fetchJob(jobId: string): Promise<JobView> {
  const res = await fetch(`/api/scene/jobs/${jobId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("fetch_failed");
  return (await res.json()) as JobView;
}
