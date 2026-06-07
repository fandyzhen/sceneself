// IdentityCheck（SPEC 1.4）：复用视觉 LLM 的 same_person 粗判（OpenRouter Gemini Lite）。
// 历史曾保留过火山人脸 1:1 比对作为正式版,现已下线火山接入。
// 如未来需要真人脸比对(更严的同人判定),在这里新增 provider 分支并扩展 sceneConfig.identityProvider 类型。
import { sceneConfig, hasVisionProviderKey } from "../config";
import { checkQuality } from "./quality-check";
import type { IdentityResult } from "../types";

export async function checkIdentity(selfieUrl: string, candidateUrl: string): Promise<IdentityResult> {
  // vlm provider：复用视觉 LLM 的 same_person 粗判
  if (!hasVisionProviderKey() || !sceneConfig.visionModel) return { same: true };
  const q = await checkQuality(selfieUrl, candidateUrl);
  return { same: q.same_person };
}
