// SetCoherenceCheck（SPEC 5.6）：整组一致性（同一人、衣着、风格、连贯逻辑、无重复构图、无欺骗感）。
// Provider：OpenRouter Gemini 3.1 Flash Lite。无 key → dev 放行。
import { createOpenRouterVision } from "../../openrouter/chat";
import { sceneConfig, hasVisionProviderKey } from "../config";
import type { SetCoherenceResult, ScenePlan } from "../types";

function coherencePrompt(plan: ScenePlan): string {
  const c = plan.continuity;
  return `You are reviewing a COHESIVE AI photo set. The FIRST image is the person's real selfie; the rest are generated frames of the set "${plan.title}" (coherence_type=${plan.coherence_type}). Reply STRICT JSON only:
{"same_person_across_set": true|false, "outfit_consistent": true|false, "visual_style_consistent": true|false, "coherence_type_followed": true|false, "duplicate_compositions": true|false, "deceptive_or_proof_like": true|false, "set_quality": 1-5, "weak_frames": [frame indexes, 1-based]}

The intended continuity for this set:
- outfit: ${c.outfit}
- hair: ${c.hairstyle}
- jewelry: ${c.jewelry}
- shoes: ${c.shoes}
- accessory: ${c.accessory}
${c.anchor_object ? `- anchor object: ${c.anchor_object.name} — ${c.anchor_object.appearance}` : ""}

CRITICAL — populate weak_frames with the 1-based index of ANY frame where ANY of these drift from the rest, even if set_quality is otherwise high:
- midriff coverage changes (e.g. one frame shows exposed belly when the outfit says full coverage)
- accessory color, position, or worn-side differs (e.g. belt in front in 5 frames but on the back in 1)
- jewelry appears in one frame but not the others
- hair is loose in one frame when it should be tied
- the anchor object's color, model, or markings differ from the rest
- outfit color or cut visibly changes
Be strict — list every drifting frame, not just the worst. Flag deceptive_or_proof_like=true if the set looks like proof of a real trip/ownership/identity rather than a creative imagined scene.`;
}

function parse(text: string): SetCoherenceResult | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try {
    const j = JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
    return {
      same_person_across_set: !!j.same_person_across_set,
      outfit_consistent: !!j.outfit_consistent,
      visual_style_consistent: !!j.visual_style_consistent,
      coherence_type_followed: !!j.coherence_type_followed,
      duplicate_compositions: !!j.duplicate_compositions,
      deceptive_or_proof_like: !!j.deceptive_or_proof_like,
      set_quality: Number(j.set_quality) || 0,
      weak_frames: Array.isArray(j.weak_frames) ? (j.weak_frames as number[]) : [],
    };
  } catch {
    return null;
  }
}

const DEV_PASS: SetCoherenceResult = {
  same_person_across_set: true,
  outfit_consistent: true,
  visual_style_consistent: true,
  coherence_type_followed: true,
  duplicate_compositions: false,
  deceptive_or_proof_like: false,
  set_quality: 5,
  weak_frames: [],
};

export async function checkSetCoherence(
  selfieUrl: string,
  frameUrls: string[],
  plan: ScenePlan,
): Promise<SetCoherenceResult> {
  if (!hasVisionProviderKey() || !sceneConfig.visionModel) return DEV_PASS;
  try {
    const text = await createOpenRouterVision(coherencePrompt(plan), [selfieUrl, ...frameUrls], {
      model: sceneConfig.visionModel,
      max_tokens: 1024,
      reasoningEffort: "minimal",
    });
    return parse(text) ?? DEV_PASS;
  } catch {
    return DEV_PASS;
  }
}

// 组通过线（SPEC 5.6）
export function setPasses(r: SetCoherenceResult): boolean {
  return (
    r.same_person_across_set &&
    r.visual_style_consistent &&
    r.coherence_type_followed &&
    !r.duplicate_compositions &&
    !r.deceptive_or_proof_like &&
    r.set_quality >= sceneConfig.setQualityMin
  );
}
