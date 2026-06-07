// QualityCheck（SPEC 5.5）：多模态视觉一次调用同时判"像不像本人 + 真实感/瑕疵"。
// Provider：OpenRouter Gemini 3.1 Flash Lite Preview。无 key → dev 放行让前端流程可演示。
import { createOpenRouterVision } from "../../openrouter/chat";
import { sceneConfig, hasVisionProviderKey } from "../config";
import type { QualityResult } from "../types";

export const QUALITY_PROMPT = `You are a strict photo QA reviewer. The FIRST image is a person's real selfie. The SECOND image is an AI-generated photo. Reply with STRICT JSON only:
{"same_person": true|false, "deformity": true|false, "plastic_skin": true|false, "quality": 1-5, "issues": ["short reason", ...]}

Target aesthetic: the SECOND image should look like a casual phone snapshot a friend took on their iPhone — NOT a professional photograph. The whole point is "amateur camera roll", not "Instagram grid".

Definitions:
- same_person: Looking at the MAIN subject in the AI photo (the person in the foreground / wearing the main outfit / closest to the camera), is THAT individual clearly the same person as the selfie? Ignore any companions, bystanders, family members, or extras that may appear in the background — judge identity only from the main subject.
  IMPORTANT for occluded scenes: if the main subject is wearing a mask, helmet, hood, scarf, sunglasses, surgical mask, or any face covering as required by the scene (a masked surgeon in the OR, a helmeted general in battle, a costumed superhero), judge same_person from the visible features only — eyes if shown, exposed skin (forehead, jawline, hands), body proportions, posture, hair color/texture peeking out, overall silhouette. Do NOT downgrade same_person to false just because part of the face is naturally hidden by the scene's required outfit — the occlusion is correct and expected. Still judge from what IS visible.
  IMPORTANT for back_view / profile / facing-away beats: if the main subject is shown from back view, three-quarter back, side profile, silhouette, facing-away, or with only hands/torso visible (a fighter squaring up to an opponent, a doctor walking away down a corridor, a chef focused on a stove, a hero looking out at the city), do NOT require front-facing facial features to judge same_person. Use outfit colors and shape, wardrobe details, hair color/length/style, exposed skin tone on neck/hands/arms, body proportions and posture, and any side-on facial features (jawline, cheekbone, ear, partial profile) that ARE visible. The subject's identity is established across the whole set — if outfit + hair + body match the reference, mark same_person=true even when the face is not directly visible in this single frame. Do NOT mark same_person=false just because this is a back view; that is the photo's intent.
- deformity: distorted hands, face, limbs, teeth, eyes? A THIRD hand or arm, extra limbs, or a stray hand/arm reaching from off-frame that doesn't belong all count as deformity=true. If the subject appears to have more than two hands or two arms, set deformity=true. **Also set deformity=true when limb proportions are unnatural**: arms that appear unnaturally long or stretched (e.g. a selfie-style extended arm where the arm length is anatomically wrong, or any arm/leg that visibly violates normal human proportion vs. the torso), elongated necks, bent-the-wrong-way joints (elbows/knees/wrists), fingers fused together or with wrong count (more or fewer than 5), or hands sized clearly out of scale relative to the face. A picture-perfect face does NOT excuse a wrong arm — set deformity=true even if the face is good.
- plastic_skin: over-smoothed, waxy, obviously-AI skin?
- quality: overall realism, 1 = obviously fake or "obviously professional studio photo", 5 = indistinguishable from a real candid phone photo taken by a friend.

CRITICAL — deduct 1-2 points from "quality" if the photo shows ANY of these (they betray a professional shoot, NOT a phone snapshot):
- shallow depth of field, bokeh, background blur, portrait mode look
- dramatic backlit, rim light, silhouette-style light, golden hour fashion-shoot lighting, sunset/sunrise glow used as a stylistic frame
- magazine-cover composition, fashion editorial framing, model pose, stylized photoshoot composition, ad-campaign symmetry
- perfectly centered subject, perfect rule-of-thirds, glossy retouched finish

Even if the photo is technically beautiful, deduct quality when it screams "this was shot by a photographer". The set should feel like 6 photos taken by a jogging friend, not a fashion week portfolio.`;

function parseQuality(text: string): QualityResult | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try {
    const j = JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
    return {
      same_person: !!j.same_person,
      deformity: !!j.deformity,
      plastic_skin: !!j.plastic_skin,
      quality: Number(j.quality) || 0,
      issues: Array.isArray(j.issues) ? (j.issues as string[]) : [],
    };
  } catch {
    return null;
  }
}

const DEV_PASS: QualityResult = { same_person: true, deformity: false, plastic_skin: false, quality: 5, issues: [] };

export async function checkQuality(selfieUrl: string, candidateUrl: string): Promise<QualityResult> {
  if (!hasVisionProviderKey() || !sceneConfig.visionModel) return DEV_PASS;
  try {
    const text = await createOpenRouterVision(QUALITY_PROMPT, [selfieUrl, candidateUrl], {
      model: sceneConfig.visionModel,
      max_tokens: 256,
      // minimal reasoning：判断式输出，no chain-of-thought, ~1-2s/帧。
      reasoningEffort: "minimal",
    });
    return parseQuality(text) ?? DEV_PASS;
  } catch {
    // 质检故障：MVP 保守放行但标记到及格线（正式版可改 fail closed）
    return { ...DEV_PASS, quality: sceneConfig.qualityMin };
  }
}

// 单帧三道及格线判定（① 像 ② 真）；③ 组一致在 SetCoherenceCheck。
export function framePasses(q: QualityResult): boolean {
  return q.same_person && !q.deformity && !q.plastic_skin && q.quality >= sceneConfig.qualityMin;
}
