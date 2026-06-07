// PromptModerationService（SPEC 5.2.2）：审核 safe_prompt 是否可进入出图流程。
// MVP = LocalRuleModerationProvider；正式 = CreemModerationProvider（live payments 前必须启用）。
// flag/deny/超时/失败 都按 block 处理（fail closed）。
import type { ModerationResult, ModerationReason } from "../types";
import { sceneConfig, hasTextProviderKey } from "../config";
import { createOpenRouterChat } from "../../openrouter/chat";
import { moderationInstruction } from "../prompts";

export interface ScreenInput {
  safePrompt: string;
  rawPrompt?: string;
  userId?: string;
  externalId?: string;
}

const USER_MESSAGES: Record<ModerationReason, string> = {
  deception_or_proof:
    "This idea sounds too much like proof of something real, such as owning something, being somewhere, or holding a real-world role. Try an imagined/editorial version instead.",
  impersonation: "We can only create scenes of you, not a public figure or another real person.",
  adult: "We cannot help create sexual or unsafe content. Try a different creative scene.",
  minor_safety: "We cannot help create sexual or unsafe content. Try a different creative scene.",
  violence:
    "We could not create this scene because it may include sensitive content. Try describing it as a creative or editorial scene instead.",
  unknown: "We could not safely review this prompt right now. Please try again in a moment. No credits were used.",
};

// 按优先级排列（高危在前，命中即返回）
const DENY_RULES: { reason: ModerationReason; test: RegExp }[] = [
  { reason: "minor_safety", test: /\b(child|children|kid|kids|minor|underage|teen|teenage|preteen|toddler|infant|baby)\b/i },
  { reason: "adult", test: /\b(nude|naked|nsfw|porn|pornographic|explicit|sexual|erotic|nipple|genital)\b/i },
  { reason: "violence", test: /\b(blood|bloody|gore|massacre|behead|corpse|mutilat)\w*/i },
  {
    reason: "impersonation",
    test: /\b(elon musk|donald trump|joe biden|taylor swift|barack obama|kim kardashian|cristiano ronaldo|lionel messi|xi jinping|vladimir putin|mark zuckerberg|jeff bezos|bill gates|celebrity|public figure)\b/i,
  },
  { reason: "deception_or_proof", test: /\b(prove|proof|evidence|really own|actually own|i own|genuinely real)\b/i },
];

function localScreen(input: ScreenInput): ModerationResult {
  // 只审改写后的 safe_prompt：raw 的高风险表达已由 IntentRewriter 处理，
  // 若这里再审 raw 会把"已安全改写"的结果重新拦下（SPEC 5.2 顺序）。
  const text = input.safePrompt;
  for (const rule of DENY_RULES) {
    if (rule.test.test(text)) {
      return { decision: "deny", reason: rule.reason, userMessage: USER_MESSAGES[rule.reason] };
    }
  }
  return { decision: "allow", userMessage: "" };
}

const FAIL_CLOSED_RESULT: ModerationResult = {
  decision: "deny",
  reason: "unknown",
  userMessage: USER_MESSAGES.unknown,
};

const CREEM_TIMEOUT_MS = 5000;
const VALID_REASONS: ReadonlySet<ModerationReason> = new Set([
  "deception_or_proof",
  "impersonation",
  "adult",
  "minor_safety",
  "violence",
  "unknown",
]);

// Creem Moderation：live payments 必须启用（SPEC 5.2.2 + launch-todo §1.5）。
// 端点尚未发布时缺 env → fail closed，让上线漏配立刻暴露。
async function creemScreen(input: ScreenInput): Promise<ModerationResult> {
  const url = process.env.CREEM_MODERATION_URL;
  const apiKey = process.env.CREEM_API_KEY;

  if (!url || !apiKey) {
    console.warn(
      "[Moderation] Creem provider selected but CREEM_MODERATION_URL or CREEM_API_KEY missing — fail closed",
    );
    return FAIL_CLOSED_RESULT;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CREEM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: input.safePrompt,
        external_id: input.externalId,
        user_id: input.userId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("[Moderation] Creem API non-2xx — fail closed", response.status);
      return FAIL_CLOSED_RESULT;
    }

    const data = (await response.json()) as {
      decision?: string;
      reason?: string;
    };

    // Creem 返回 "allow" / "flag" / "deny"。flag 与 deny 都视作 block。
    if (data.decision === "allow") {
      return { decision: "allow", userMessage: "" };
    }

    const reason = (data.reason && VALID_REASONS.has(data.reason as ModerationReason)
      ? (data.reason as ModerationReason)
      : "unknown") as ModerationReason;

    return { decision: "deny", reason, userMessage: USER_MESSAGES[reason] };
  } catch (error) {
    console.error("[Moderation] Creem API call failed — fail closed:", error);
    return FAIL_CLOSED_RESULT;
  } finally {
    clearTimeout(timeout);
  }
}

async function llmScreen(input: ScreenInput): Promise<ModerationResult> {
  if (!hasTextProviderKey()) return localScreen(input); // 无 key 退正则预筛(dev 演示)
  try {
    const text = await createOpenRouterChat(
      [{ role: "user", content: moderationInstruction(input.safePrompt) }],
      { temperature: 0, max_tokens: 64, model: sceneConfig.textModel, reasoningEffort: "minimal" },
    );
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    const j = s !== -1 && e > s ? (JSON.parse(text.slice(s, e + 1)) as { decision?: string; reason?: string }) : null;
    // fail closed：无法从 LLM 响应解析出 JSON(如返回纯文字)→ 一律 deny,绝不误放行。
    if (!j) return FAIL_CLOSED_RESULT;
    if (j.decision === "allow") return { decision: "allow", userMessage: "" };
    const reason = (j.reason && VALID_REASONS.has(j.reason as ModerationReason) ? j.reason : "unknown") as ModerationReason;
    return { decision: "deny", reason, userMessage: USER_MESSAGES[reason] };
  } catch {
    return FAIL_CLOSED_RESULT; // LLM 故障 fail closed
  }
}

export async function screenPrompt(input: ScreenInput): Promise<ModerationResult> {
  try {
    if (sceneConfig.moderationProvider === "creem") {
      return await creemScreen(input);
    }
    if (sceneConfig.moderationProvider === "llm") {
      return await llmScreen(input);
    }
    return localScreen(input);
  } catch {
    // fail closed：审核出错一律按 deny，不继续生成
    return FAIL_CLOSED_RESULT;
  }
}

// flag 和 deny 都按 block 处理
export function isBlocked(result: ModerationResult): boolean {
  return result.decision !== "allow";
}
