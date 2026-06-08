import { NextRequest, NextResponse } from "next/server";
import { getActiveSessionUser } from "@/lib/auth/session";
import * as repo from "@/lib/scene/repository";
import { getErrorMessage } from "@/lib/error-utils";

// 前端轮询：返回 job + frames（逐张渲染）。dropped 永不展示。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await repo.getJobWithFrames(id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 越权保护：登录用户的 job 仅 owner 可查；匿名 job 靠不可猜的 uuid
    if (data.job.userId) {
      const access = await getActiveSessionUser(req.headers);
      const viewerId = access.ok ? access.user.id : null;
      if (viewerId !== data.job.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // dropped 张数用于结果页"补偿提示"展示（前端不需要 dropped 帧实体）
    const droppedCount = data.frames.filter(f => f.status === "dropped").length;

    const frames = data.frames
      .filter(f => f.status !== "dropped")
      .map(f => ({
        index: f.index,
        status: f.status,
        imageUrl: f.imageUrl,
        isCover: f.isCover,
        narrativeRole: f.shotSpec?.narrative_role ?? null,
        summary: f.shotSpec?.summary ?? null,
        caption: f.shotSpec?.caption ?? null,
      }));

    return NextResponse.json({
      job: {
        id: data.job.id,
        status: data.job.status,
        tier: data.job.tier,
        shotCount: data.job.shotCount,
        title: data.job.scenePlan?.title ?? null,
        aspectRatio: data.job.aspectRatio,
        safePrompt: data.job.safePrompt ?? null,
        creditsCost: data.job.creditsCost ?? 0,
        droppedCount,
      },
      frames,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, "Could not load this set.") }, { status: 500 });
  }
}
