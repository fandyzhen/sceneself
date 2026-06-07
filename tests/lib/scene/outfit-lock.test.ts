// outfit / accessory 在 ACTIVITY_STYLING + 每帧 prompt 中必须有强位置/覆盖锁，
// 否则火山 5.0 会出现：第 4 张露肚皮 / 腰包前后漂移。
import { describe, it, expect } from "vitest";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";
import { buildSetPrompt } from "@/lib/scene/services/image-gen";
import type { SceneClassification } from "@/lib/scene/types";

const lifestyle: SceneClassification = {
  scenario_cluster: "aesthetic_lifestyle",
  risk_level: "low",
  coherence_type: "aesthetic_series",
  moderation_action: "allow",
};

describe("running activity styling: midriff + belt position lock", () => {
  it("running outfit explicitly states midriff is covered (no crop top)", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const outfit = plan.continuity.outfit.toLowerCase();
    // 必须包含覆盖肚皮的明确措辞
    expect(outfit).toMatch(/full midriff|covered midriff|covers the midriff|not cropped|no crop top|no exposed belly|full coverage/);
  });

  it("running accessory locks the belt position (centered front, never back)", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const acc = plan.continuity.accessory.toLowerCase();
    // 必须明确"in front"和"never on the back"
    expect(acc).toMatch(/(centered.*front|front of (the )?waist)/);
    expect(acc).toMatch(/never.*back|not on the back|always in front/);
  });
});

describe("buildSetPrompt enforces outfit / accessory anti-drift", () => {
  it("set prompt forbids exposed midriff when outfit is athletic top", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const prompt = buildSetPrompt(plan).toLowerCase();
    expect(prompt).toMatch(/no exposed midriff|no exposed belly|midriff (stays |always )?covered/);
  });

  it("set prompt forbids accessory position drift", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const prompt = buildSetPrompt(plan).toLowerCase();
    expect(prompt).toMatch(/accessory.*(same|never).*position|position.*never changes|stays in the same spot|same worn-side/);
  });
});

describe("non-activity styling default also has anti-drift accessory rule", () => {
  it("default styling accessory specifies which shoulder/side", () => {
    const plan = buildFallbackScenePlan("morning coffee at a cafe", lifestyle, 6, {});
    const acc = plan.continuity.accessory.toLowerCase();
    expect(acc).toMatch(/right shoulder|left shoulder|right hip|left hip|right side|left side|crossbody/);
  });
});
