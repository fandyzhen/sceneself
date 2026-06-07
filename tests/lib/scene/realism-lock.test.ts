// Realism lock：把 5 个用户反馈的真实性问题锁进 schema 和 prompt：
//   1. 人物太近 → wide-dominant + 量化 face %
//   2. 包颜色 / 位置不一致 → accessory 必填具体颜色 + 哪一侧
//   3. 项链/配饰随机出现 → jewelry 字段必填 + 强 negative
//   4. 表情僵硬一致 → expression_beat 每帧独立
//   5. 跑步该扎头发 → hairstyle 必填 + activity-aware styling
import { buildFallbackScenePlan, validateScenePlan, detectActivity, hairstyleForActivity } from "@/lib/scene/scene-plan";
import { buildSetPrompt } from "@/lib/scene/services/image-gen";
import type { SceneClassification, ScenePlan } from "@/lib/scene/types";

const lifestyle: SceneClassification = {
  scenario_cluster: "aesthetic_lifestyle",
  risk_level: "low",
  coherence_type: "aesthetic_series",
  moderation_action: "allow",
};

describe("continuity locks for runtime hair / jewelry / shoes (#2 #3 #5)", () => {
  it("buildFallbackScenePlan always fills hairstyle, jewelry, and shoes", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    expect(plan.continuity.hairstyle.length).toBeGreaterThan(3);
    expect(plan.continuity.jewelry.length).toBeGreaterThan(0);
    expect(plan.continuity.shoes.length).toBeGreaterThan(3);
  });

  it("accessory description includes color and worn-side, not just 'a small bag'", () => {
    const plan = buildFallbackScenePlan("morning coffee at a cafe", lifestyle, 6, {});
    const acc = plan.continuity.accessory.toLowerCase();
    // 必须有具体颜色 + 至少一个侧别 / 携带方式词
    expect(acc).toMatch(/black|white|brown|tan|beige|cream|navy|cognac/);
    expect(acc).toMatch(/right side|left side|crossbody|over the right|over the left|on the right shoulder|on the left shoulder/);
  });

  it("validateScenePlan rejects continuity missing hairstyle / jewelry / shoes", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const bad: ScenePlan = { ...plan, continuity: { ...plan.continuity, hairstyle: "" } };
    expect(validateScenePlan(bad, 6).valid).toBe(false);

    const bad2: ScenePlan = { ...plan, continuity: { ...plan.continuity, jewelry: "" } };
    expect(validateScenePlan(bad2, 6).valid).toBe(false);

    const bad3: ScenePlan = { ...plan, continuity: { ...plan.continuity, shoes: "" } };
    expect(validateScenePlan(bad3, 6).valid).toBe(false);
  });

  it("buildSetPrompt repeats hairstyle/jewelry/shoes and forbids unlisted accessories", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const prompt = buildSetPrompt(plan);
    expect(prompt).toContain(plan.continuity.hairstyle);
    expect(prompt).toContain(plan.continuity.shoes);
    // 必须有强 negative，避免 LLM 随机加项链
    expect(prompt.toLowerCase()).toMatch(/no additional jewelry|no extra jewelry|no accessories not listed/);
  });
});

describe("activity-aware styling (#5)", () => {
  it("detectActivity picks up running / jogging from the prompt", () => {
    expect(detectActivity("running in a park")).toBe("running");
    expect(detectActivity("morning jog along the river")).toBe("running");
    expect(detectActivity("training for a marathon")).toBe("running");
  });

  it("detectActivity recognises swimming / biking / cooking / yoga", () => {
    expect(detectActivity("swimming at the beach")).toBe("swimming");
    expect(detectActivity("biking through the city")).toBe("biking");
    expect(detectActivity("cooking pasta at home")).toBe("cooking");
    expect(detectActivity("morning yoga session")).toBe("yoga");
  });

  it("returns null for non-activity scenes", () => {
    expect(detectActivity("morning coffee at a cafe")).toBeNull();
    expect(detectActivity("imagined Dubai travel")).toBeNull();
  });

  it("hairstyleForActivity returns activity-appropriate hair: running → ponytail", () => {
    expect(hairstyleForActivity("running").toLowerCase()).toMatch(/ponytail|tied back|braid|bun/);
  });

  it("hairstyleForActivity returns activity-appropriate hair: swimming → wet", () => {
    expect(hairstyleForActivity("swimming").toLowerCase()).toMatch(/wet|damp|slicked/);
  });

  it("buildFallbackScenePlan('running in a park') yields athletic outfit + ponytail-style hair", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    expect(plan.continuity.hairstyle.toLowerCase()).toMatch(/ponytail|tied back|braid|bun|cap/);
    expect(plan.continuity.outfit.toLowerCase()).toMatch(/athletic|sport|leggings|tank|running/);
    expect(plan.continuity.shoes.toLowerCase()).toMatch(/running shoes|sneakers|trainers/);
  });
});

describe("per-frame expression_beat (#4)", () => {
  it("every shot has a non-empty expression_beat", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    expect(plan.shots.every(s => (s.expression_beat ?? "").length > 5)).toBe(true);
  });

  it("the 6 expression_beats are all distinct (no two frames with identical micro-expression)", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const beats = plan.shots.map(s => s.expression_beat);
    expect(new Set(beats).size).toBe(beats.length);
  });

  it("buildSetPrompt mentions distinct facial expression per photo", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const prompt = buildSetPrompt(plan);
    // SetPrompt 必须告诉模型每张表情不一样
    expect(prompt.toLowerCase()).toMatch(/distinct.*expression|different.*expression|micro-expression|never the exact same face/);
  });

  it("shot.image_prompt embeds its expression_beat", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    for (const shot of plan.shots) {
      expect(shot.image_prompt).toContain(shot.expression_beat ?? "");
    }
  });
});

describe("wide-dominant shot distribution (#1)", () => {
  it("a 6-shot fallback plan uses at least 3 wide shots (≥50%)", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const wideCount = plan.shots.filter(s => s.shot_size === "wide").length;
    expect(wideCount).toBeGreaterThanOrEqual(3);
  });

  it("a 6-shot fallback plan uses at most 1 close-up", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const closeCount = plan.shots.filter(s => s.shot_size === "close").length;
    expect(closeCount).toBeLessThanOrEqual(1);
  });

  it("buildSetPrompt asks for environmental shots with small faces", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, {});
    const prompt = buildSetPrompt(plan).toLowerCase();
    // wide-dominant 表达
    expect(prompt).toMatch(/wide|environmental|small face|face occupies/);
  });
});
