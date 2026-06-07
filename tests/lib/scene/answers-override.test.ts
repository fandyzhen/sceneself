// 用户在 clarify 问答中回答的颜色/风格必须覆盖默认 styling 的颜色，
// 否则用户回答"芭比粉"系统生成黑色（实际 bug）。
import { describe, it, expect } from "vitest";
import { buildFallbackScenePlan, extractColorAnswer } from "@/lib/scene/scene-plan";
import type { SceneClassification } from "@/lib/scene/types";

const lifestyle: SceneClassification = {
  scenario_cluster: "aesthetic_lifestyle",
  risk_level: "low",
  coherence_type: "aesthetic_series",
  moderation_action: "allow",
};

describe("extractColorAnswer", () => {
  it("picks up Chinese color words from any answer slot", () => {
    expect(extractColorAnswer({ color: "芭比粉" })).toBe("芭比粉");
    expect(extractColorAnswer({ outfit: "红色" })).toBe("红色");
    expect(extractColorAnswer({ mood: "蓝色风格" })).toBe("蓝色");
  });

  it("picks up English color words", () => {
    expect(extractColorAnswer({ color: "barbie pink" })).toBe("barbie pink");
    expect(extractColorAnswer({ outfit: "navy blue" })).toBe("navy blue");
    expect(extractColorAnswer({ mood: "soft sage green vibes" })).toBe("sage green");
  });

  it("returns null when no color is mentioned", () => {
    expect(extractColorAnswer({ mood: "relaxed" })).toBeNull();
    expect(extractColorAnswer({})).toBeNull();
    expect(extractColorAnswer({ time: "morning" })).toBeNull();
  });
});

describe("buildFallbackScenePlan applies user color answer", () => {
  it("when user answers color='芭比粉', outfit contains 芭比粉 (not black)", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, { color: "芭比粉" });
    expect(plan.continuity.outfit).toContain("芭比粉");
    expect(plan.continuity.outfit.toLowerCase()).not.toContain("black");
  });

  it("when user answers color='barbie pink', outfit contains 'barbie pink'", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, { color: "barbie pink" });
    expect(plan.continuity.outfit.toLowerCase()).toContain("barbie pink");
    expect(plan.continuity.outfit.toLowerCase()).not.toMatch(/\bblack\b/);
  });

  it("when answer mentions a color anywhere, accessory color tracks the request when possible", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, { outfit: "powder blue" });
    expect(plan.continuity.outfit.toLowerCase()).toContain("powder blue");
  });

  it("when no color answer, falls back to activity styling default (black for running)", () => {
    const plan = buildFallbackScenePlan("running in a park", lifestyle, 6, { mood: "relaxed" });
    expect(plan.continuity.outfit.toLowerCase()).toMatch(/\bblack\b/);
  });
});
