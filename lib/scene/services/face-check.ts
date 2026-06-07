// FaceCheck（upload 阶段闸）：vision LLM 校验"清晰单人人脸自拍"。
// 无 key 或解析失败 → 保守放行（不误伤真人）；正式可改 fail closed。
import { createOpenRouterVision } from "../../openrouter/chat";
import { sceneConfig, hasVisionProviderKey } from "../config";
import { FACE_CHECK_PROMPT } from "../prompts";

export interface FaceCheckResult {
  ok: boolean;
  reason?: "no_face" | "multiple_people";
}

export async function checkFace(selfieUrl: string): Promise<FaceCheckResult> {
  if (!hasVisionProviderKey() || !sceneConfig.visionModel) return { ok: true }; // dev 放行
  try {
    const text = await createOpenRouterVision(FACE_CHECK_PROMPT, [selfieUrl], {
      model: sceneConfig.visionModel,
      max_tokens: 128,
      // minimal reasoning：简单判断式输出，无需 chain-of-thought。
      reasoningEffort: "minimal",
    });
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    const j =
      s !== -1 && e > s
        ? (JSON.parse(text.slice(s, e + 1)) as {
            has_clear_face?: boolean;
            single_person?: boolean;
          })
        : null;
    if (!j) return { ok: true }; // 解析失败保守放行（不误伤真人）
    if (!j.has_clear_face) return { ok: false, reason: "no_face" };
    if (j.single_person === false) return { ok: false, reason: "multiple_people" };
    return { ok: true };
  } catch {
    return { ok: true }; // 检测故障放行（不阻塞；正式可改 fail closed）
  }
}
