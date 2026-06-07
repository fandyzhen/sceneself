// anchor_object：当用户提到核心物体（直升机/法拉利/狗/...）时，必须在 continuity 锁定
// 该物体的视觉规格，并在每帧 image_prompt 里强制重复，避免组内颜色/型号不一致。
import { validateScenePlan, buildFallbackScenePlan, detectAnchorObject } from "@/lib/scene/scene-plan";
import { buildSetPrompt } from "@/lib/scene/services/image-gen";
import type { SceneClassification, ScenePlan } from "@/lib/scene/types";

const lux: SceneClassification = {
  scenario_cluster: "luxury_editorial",
  risk_level: "medium",
  coherence_type: "status_facets",
  moderation_action: "allow",
};

describe("detectAnchorObject", () => {
  it("detects 'helicopter' when user says they bought one", () => {
    const a = detectAnchorObject("I bought a private helicopter");
    expect(a?.name.toLowerCase()).toContain("helicopter");
  });

  it("detects vehicles after 'i bought / my / i own'", () => {
    expect(detectAnchorObject("I bought a Ferrari")?.name.toLowerCase()).toContain("ferrari");
    expect(detectAnchorObject("my new Rolex Daytona")?.name.toLowerCase()).toContain("rolex");
    expect(detectAnchorObject("I own a black Porsche 911")?.name.toLowerCase()).toContain("porsche");
  });

  it("fills appearance with a concrete spec — color, material, identifying marks", () => {
    const a = detectAnchorObject("I bought a private helicopter");
    expect(a?.appearance.length).toBeGreaterThan(15);
    // 必须包含至少一个可视化特征关键词
    expect(a?.appearance.toLowerCase()).toMatch(/color|black|white|matte|glossy|tail|paint|interior/);
  });

  it("returns null when prompt has no anchor object", () => {
    expect(detectAnchorObject("morning coffee at a cafe")).toBeNull();
    expect(detectAnchorObject("cinematic Tokyo street scene")).toBeNull();
  });
});

describe("ScenePlan.continuity.anchor_object", () => {
  it("buildFallbackScenePlan attaches anchor_object when the prompt references one", () => {
    const plan = buildFallbackScenePlan("I bought a private helicopter", lux, 6, {});
    expect(plan.continuity.anchor_object).toBeDefined();
    expect(plan.continuity.anchor_object?.name.toLowerCase()).toContain("helicopter");
    expect(plan.continuity.anchor_object?.appearance.length).toBeGreaterThan(15);
  });

  it("buildFallbackScenePlan leaves anchor_object undefined for non-anchor scenes", () => {
    const plan = buildFallbackScenePlan(
      "imagined Dubai travel photo set",
      { ...lux, scenario_cluster: "destination_travel", coherence_type: "time_arc" },
      6,
      {},
    );
    expect(plan.continuity.anchor_object).toBeUndefined();
  });

  it("validateScenePlan accepts plans with or without anchor_object (optional)", () => {
    const planA = buildFallbackScenePlan("I bought a private helicopter", lux, 6, {});
    expect(validateScenePlan(planA, 6).valid).toBe(true);

    const planB = buildFallbackScenePlan(
      "imagined Dubai travel photo set",
      { ...lux, scenario_cluster: "destination_travel", coherence_type: "time_arc" },
      6,
      {},
    );
    expect(validateScenePlan(planB, 6).valid).toBe(true);
  });

  it("validateScenePlan rejects anchor_object with missing appearance", () => {
    const planA = buildFallbackScenePlan("I bought a private helicopter", lux, 6, {});
    const bad: ScenePlan = {
      ...planA,
      continuity: {
        ...planA.continuity,
        anchor_object: { name: "helicopter", appearance: "" },
      },
    };
    expect(validateScenePlan(bad, 6).valid).toBe(false);
  });
});

describe("buildSetPrompt embeds the anchor lock", () => {
  const lockedPlan = buildFallbackScenePlan("I bought a private helicopter", lux, 6, {});

  it("repeats the anchor_object.appearance for every photo in the set", () => {
    const prompt = buildSetPrompt(lockedPlan);
    expect(prompt.toLowerCase()).toContain("helicopter");
    // 强一致措辞：必须包含"same"和"every"之类的全局指令
    expect(prompt.toLowerCase()).toMatch(/same\s+.*helicopter|identical|every photo/);
  });

  it("does NOT inject anchor copy when continuity has no anchor_object", () => {
    const noAnchor = buildFallbackScenePlan(
      "imagined Dubai travel photo set",
      { ...lux, scenario_cluster: "destination_travel", coherence_type: "time_arc" },
      6,
      {},
    );
    const prompt = buildSetPrompt(noAnchor);
    // 没有 anchor 时不出现锁定文案
    expect(prompt.toLowerCase()).not.toMatch(/identical (helicopter|car|watch)/);
  });
});
