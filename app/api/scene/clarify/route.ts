import { NextRequest, NextResponse } from "next/server";
import { rewriteIntent, screenPrompt, isBlocked, analyzeInput, generateSafeAlternatives } from "@/lib/scene/services";
import { normalizePromptForPlanning } from "@/lib/scene/services/translation";
import { getErrorMessage } from "@/lib/error-utils";

// 固定顺序:raw → IntentRewriter → safe → PromptModeration → analyzeInput。
// 纯分析,不创建 job、不扣 credits;首组免费、不强制注册。
// analyzeInput 取代旧的 classifyScene+generateClarifyingQuestions,
// 返回 storyline_type / tone_suggestions / focus_options 驱动 2 题问答。
const SAFE_CHIPS = [
  "Luxury car editorial scene",
  "Cinematic first-class inspired travel set",
  "Dream CEO-style office portrait set",
];

// IntentRewriter + PromptModeration + 消歧问题 = 多次 LLM 调用。
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { rawPrompt } = (await req.json()) as { rawPrompt?: string };
    if (!rawPrompt || typeof rawPrompt !== "string" || rawPrompt.trim().length < 2) {
      return NextResponse.json({ error: "Please describe a scene." }, { status: 400 });
    }

    const normalized = await normalizePromptForPlanning(rawPrompt.trim());
    const workingPrompt = normalized.workingPrompt;

    const rewrite = await rewriteIntent({ rawPrompt: workingPrompt });
    if (rewrite.rewriteReason === "blocked") {
      const mod = await screenPrompt({ safePrompt: rawPrompt });
      const alts = await generateSafeAlternatives(rawPrompt).catch(() => null);
      return NextResponse.json(
        {
          rejected: {
            reason: mod.reason ?? "unknown",
            userMessage: mod.userMessage || rewrite.userNotice || "This scene needs a quick rewrite.",
            safeRewriteChips: alts ?? SAFE_CHIPS,
          },
        },
        { status: 200 },
      );
    }

    const moderation = await screenPrompt({ safePrompt: rewrite.safePrompt, rawPrompt });
    if (isBlocked(moderation)) {
      const alts = await generateSafeAlternatives(rawPrompt).catch(() => null);
      return NextResponse.json(
        {
          rejected: {
            reason: moderation.reason ?? "unknown",
            userMessage: moderation.userMessage,
            safeRewriteChips: alts ?? SAFE_CHIPS,
          },
        },
        { status: 200 },
      );
    }

    const analysis = await analyzeInput(rewrite.safePrompt);

    return NextResponse.json({
      safePrompt: rewrite.safePrompt,
      rewriteApplied: rewrite.rewriteApplied,
      rewriteReason: rewrite.rewriteReason,
      userNotice: rewrite.userNotice,
      // 故事线问答契约:替代旧的 classification/questions
      storyline_type: analysis.storyline_type,
      tone_suggestions: analysis.tone_suggestions,
      focus_options: analysis.focus_options,
      // 多语言:前端据此显示"已自动翻译为英文"提示
      originalLanguage: normalized.originalLanguage,
      wasTranslated: normalized.wasTranslated,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, "Could not analyze this scene.") }, { status: 500 });
  }
}
