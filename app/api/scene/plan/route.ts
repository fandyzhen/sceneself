import { NextRequest, NextResponse } from "next/server";
import { screenPrompt, isBlocked, buildScenePlan } from "@/lib/scene/services";
import { shotCountForTier } from "@/lib/scene/config";
import { getErrorMessage } from "@/lib/error-utils";
import type { SelfieAppearance } from "@/lib/scene/types";

// OpenRouter 文本模型一次性出 ScenePlan,正常 5-15s,留余量。
export const maxDuration = 60;

// 生成 scene_plan（帧数按 tier）。纯规划，不创建 job、不扣 credits。
export async function POST(req: NextRequest) {
  try {
    const { safePrompt, rawPrompt, answers, tier, appearance } = (await req.json()) as {
      safePrompt?: string;
      rawPrompt?: string; // 用户原始输入（未翻译），用于把展示 caption 本地化成输入语言
      answers?: Record<string, string>;
      tier?: string;
      appearance?: SelfieAppearance | null; // 自拍画像（性别/发型），造型适配用
    };
    if (!safePrompt || typeof safePrompt !== "string") {
      return NextResponse.json({ error: "Missing scene description." }, { status: 400 });
    }

    const t = tier === "paid" ? "paid" : "free";

    // 纵深防御：规划前再审核一次（用户改写后必须重走）
    const moderation = await screenPrompt({ safePrompt });
    if (isBlocked(moderation)) {
      return NextResponse.json({ error: moderation.userMessage }, { status: 422 });
    }

    const scenePlan = await buildScenePlan(
      safePrompt,
      answers ?? {},
      shotCountForTier(t),
      typeof rawPrompt === "string" && rawPrompt.trim() ? rawPrompt : safePrompt,
      appearance ?? undefined,
    );
    return NextResponse.json({ scenePlan });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, "Could not plan this scene.") }, { status: 500 });
  }
}
