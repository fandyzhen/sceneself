// generation_job / generation_frame 的 DB 读写封装（复用现有 Drizzle 实例）。
import { randomUUID } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import { db } from "../db";
import { generationJob, generationFrame } from "../db/schema";
import type { ScenePlan, ShotSpec, Tier, JobStatus, FrameStatus, IdentityRef } from "./types";

export type GenerationJobRow = typeof generationJob.$inferSelect;
export type GenerationFrameRow = typeof generationFrame.$inferSelect;

export interface CreateJobInput {
  userId?: string | null;
  tier: Tier;
  shotCount: number;
  rawPrompt?: string;
  safePrompt?: string;
  rewriteApplied?: boolean;
  rewriteReason?: string;
  scenePlan?: ScenePlan;
  selfieUrl?: string;
  identityRef?: IdentityRef;
  creditsCost?: number;
}

export async function createJob(input: CreateJobInput): Promise<GenerationJobRow> {
  const [row] = await db
    .insert(generationJob)
    .values({
      id: randomUUID(),
      userId: input.userId ?? null,
      tier: input.tier,
      shotCount: input.shotCount,
      status: "draft",
      rawPrompt: input.rawPrompt,
      safePrompt: input.safePrompt,
      rewriteApplied: input.rewriteApplied ?? false,
      rewriteReason: input.rewriteReason ?? "none",
      scenePlan: input.scenePlan,
      selfieUrl: input.selfieUrl,
      identityRef: input.identityRef,
      creditsCost: input.creditsCost ?? 0,
    })
    .returning();
  return row;
}

export async function getJob(id: string): Promise<GenerationJobRow | null> {
  const [row] = await db.select().from(generationJob).where(eq(generationJob.id, id)).limit(1);
  return row ?? null;
}

export interface UpdateJobPatch {
  status?: JobStatus;
  safePrompt?: string;
  scenePlan?: ScenePlan;
  moderationStatus?: string;
  moderationReason?: string | null;
  selfieUrl?: string | null;
  identityRef?: IdentityRef | null;
  creditsCost?: number;
  completedAt?: Date;
}

export async function updateJob(id: string, patch: UpdateJobPatch): Promise<void> {
  await db.update(generationJob).set(patch).where(eq(generationJob.id, id));
}

export async function insertFrames(jobId: string, specs: ShotSpec[]): Promise<GenerationFrameRow[]> {
  if (specs.length === 0) return [];
  const rows = await db
    .insert(generationFrame)
    .values(
      specs.map(spec => ({
        id: randomUUID(),
        jobId,
        index: spec.index,
        shotSpec: spec,
        status: "pending" as FrameStatus,
      })),
    )
    .returning();
  return rows;
}

export interface UpdateFramePatch {
  status?: FrameStatus;
  imageUrl?: string | null;
  identityScore?: number | null;
  qualityScore?: number | null;
  failReason?: string | null;
  candidatesTried?: number;
  isCover?: boolean;
}

export async function updateFrame(id: string, patch: UpdateFramePatch): Promise<void> {
  await db.update(generationFrame).set(patch).where(eq(generationFrame.id, id));
}

export async function listFrames(jobId: string): Promise<GenerationFrameRow[]> {
  return db
    .select()
    .from(generationFrame)
    .where(eq(generationFrame.jobId, jobId))
    .orderBy(asc(generationFrame.index));
}

export async function getJobWithFrames(
  id: string,
): Promise<{ job: GenerationJobRow; frames: GenerationFrameRow[] } | null> {
  const job = await getJob(id);
  if (!job) return null;
  const frames = await listFrames(id);
  return { job, frames };
}

// 隐私清理:job 完成后删除自拍与身份特征(SPEC 9.2 / privacy 第 3 节)。
// 必须 ① 先删 R2 上的物理文件 ② 再清 DB 字段。
// R2 删除是 best-effort(失败不阻断,有 lifecycle rule 兜底),DB 清理是强制。
export async function purgeIdentity(id: string): Promise<void> {
  const { tryDeleteFromR2Url } = await import("../r2-storage");
  // 取当前 selfieUrl + identityRef,这些是 R2 上的真实文件凭证
  const [row] = await db
    .select({ selfieUrl: generationJob.selfieUrl, identityRef: generationJob.identityRef })
    .from(generationJob)
    .where(eq(generationJob.id, id))
    .limit(1);
  if (row) {
    if (row.selfieUrl) await tryDeleteFromR2Url(row.selfieUrl);
    const refUrls = (row.identityRef as { selfieUrls?: string[] } | null)?.selfieUrls ?? [];
    for (const u of refUrls) await tryDeleteFromR2Url(u);
  }
  await db.update(generationJob).set({ selfieUrl: null, identityRef: null }).where(eq(generationJob.id, id));
}
