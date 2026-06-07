// 兜底清理：删除超过 SELFIE_RETENTION_HOURS 的 selfie_url / identity_ref（SPEC 9 / privacy 第 3 节）。
// orchestrator 完成时已 purgeIdentity，本端点处理失败/超时/未交付的孤立记录，
// 兑现"within 24 hours at the latest"的隐私承诺。
import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generationJob } from "@/lib/db/schema";
import { sceneConfig } from "@/lib/scene/config";
import { tryDeleteFromR2Url } from "@/lib/r2-storage";
import { and, inArray, isNotNull, lt, or } from "drizzle-orm";

const CRON_SECRET = process.env.CRON_SECRET;
const CRON_JOBS_USERNAME = process.env.CRON_JOBS_USERNAME;
const CRON_JOBS_PASSWORD = process.env.CRON_JOBS_PASSWORD;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const hasBasicCreds = Boolean(CRON_JOBS_USERNAME && CRON_JOBS_PASSWORD);
  const hasBearer = Boolean(CRON_SECRET);

  const isBasicAuthorized = (() => {
    if (!hasBasicCreds) return false;
    if (!authHeader.startsWith("Basic ")) return false;
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
      const [username, password] = decoded.split(":");
      return username === CRON_JOBS_USERNAME && password === CRON_JOBS_PASSWORD;
    } catch (error) {
      console.error("[Cron] Failed to decode basic auth header", error);
      return false;
    }
  })();

  const isBearerAuthorized = hasBearer && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isBasicAuthorized && !isBearerAuthorized) {
    console.error("[Cron] Unauthorized request");
    if (!hasBasicCreds && !hasBearer) {
      return NextResponse.json({ error: "Cron auth not configured" }, { status: 500 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retentionHours = sceneConfig.selfieRetentionHours;
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

  // 1. 先 SELECT 出过期的行(含 selfieUrl + identityRef),拿到 R2 上的物理文件凭证
  const rows = await db
    .select({
      id: generationJob.id,
      selfieUrl: generationJob.selfieUrl,
      identityRef: generationJob.identityRef,
    })
    .from(generationJob)
    .where(
      and(
        lt(generationJob.createdAt, cutoff),
        or(isNotNull(generationJob.selfieUrl), isNotNull(generationJob.identityRef)),
      ),
    );

  // 2. 删 R2 上的物理文件(best-effort,失败不阻断 DB 清理)
  let r2Deleted = 0;
  for (const row of rows) {
    if (row.selfieUrl && (await tryDeleteFromR2Url(row.selfieUrl))) r2Deleted++;
    const refUrls = (row.identityRef as { selfieUrls?: string[] } | null)?.selfieUrls ?? [];
    for (const u of refUrls) {
      if (await tryDeleteFromR2Url(u)) r2Deleted++;
    }
  }

  // 3. 清 DB 字段(强制成功)
  const ids = rows.map(r => r.id);
  if (ids.length > 0) {
    await db
      .update(generationJob)
      .set({ selfieUrl: null, identityRef: null })
      .where(inArray(generationJob.id, ids));
  }

  return NextResponse.json({
    retentionHours,
    cutoff: cutoff.toISOString(),
    purged: ids.length,
    r2Deleted,
    sample: ids.slice(0, 10),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
