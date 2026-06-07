import { NextRequest, NextResponse, after } from "next/server";
import { getActiveSessionUser } from "@/lib/auth/session";
import { canUserAfford, deductCredits } from "@/lib/credits";
import { screenPrompt, isBlocked } from "@/lib/scene/services";
import { validateScenePlan } from "@/lib/scene/scene-plan";
import { SHOTS_PER_SET, creditsForSet } from "@/lib/scene/pricing";
import { hasActiveSubscription } from "@/lib/billing/subscription-status";
import * as repo from "@/lib/scene/repository";
import { runJob } from "@/lib/scene/orchestrator";
import { getErrorMessage } from "@/lib/error-utils";
import type { ScenePlan } from "@/lib/scene/types";

export async function POST(req: NextRequest) {
  try {
    // v2：生成是扣积分动作，必须登录（注册即送 300 积分 = 免费体验一次）。
    const access = await getActiveSessionUser(req.headers);
    if (!access.ok) {
      return NextResponse.json({ error: "请先登录后再生成。", code: "auth_required" }, { status: 401 });
    }
    const userId = access.user.id;

    const { selfieUrl, scenePlan, safePrompt } = (await req.json()) as {
      selfieUrl?: string;
      scenePlan?: ScenePlan;
      safePrompt?: string;
    };

    if (!selfieUrl) return NextResponse.json({ error: "A selfie is required." }, { status: 400 });
    if (!scenePlan) return NextResponse.json({ error: "Missing scene plan." }, { status: 400 });

    const shotCount = SHOTS_PER_SET;
    const valid = validateScenePlan(scenePlan, shotCount);
    if (!valid.valid) {
      return NextResponse.json({ error: "Invalid scene plan", details: valid.errors }, { status: 422 });
    }

    // 审核必须在扣 credits / 创建 job 之前（fail closed）。
    if (safePrompt) {
      const moderation = await screenPrompt({ safePrompt });
      if (isBlocked(moderation)) {
        return NextResponse.json({ error: moderation.userMessage }, { status: 422 });
      }
    }

    // 水印：有有效订阅 → 无水印（tier=paid）；仅靠注册赠送积分 → 带水印（tier=free）。
    const hasSub = await hasActiveSubscription(userId);
    const tier = hasSub ? "paid" : "free";

    const creditsCost = creditsForSet(); // 6 × 50 = 300（预扣全额，runJob 完成按未交付返还）。
    const affordable = await canUserAfford(userId, creditsCost);
    if (!affordable) {
      return NextResponse.json(
        { error: "积分不足，请购买积分包或订阅后再试。", creditsNeeded: creditsCost, code: "insufficient_credits" },
        { status: 402 },
      );
    }

    const job = await repo.createJob({
      userId,
      tier,
      shotCount,
      safePrompt,
      scenePlan,
      selfieUrl,
      identityRef: { selfieUrls: [selfieUrl] },
      creditsCost,
    });
    await repo.insertFrames(job.id, scenePlan.shots);

    // 审核通过后才扣 credits（预扣 300）。
    const deduct = await deductCredits(userId, creditsCost, "scene_set", job.id);
    if (!deduct.success) {
      await repo.updateJob(job.id, { status: "failed" });
      return NextResponse.json({ error: deduct.error ?? "Failed to deduct credits" }, { status: 402 });
    }

    // 后台单函数内跑完编排，前端轮询 GET /api/scene/jobs/:id 逐张揭晓（SPEC 5.9）。
    after(async () => {
      await runJob(job.id);
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, "Could not start generation.") }, { status: 500 });
  }
}
