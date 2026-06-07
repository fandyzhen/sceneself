// 防止"专业相机感"：每个 image_prompt 必须在开头明确禁止 bokeh/dramatic lighting/
// fashion editorial，并加 amateur snapshot 信号（horizon tilt / off-center / handheld blur）。
import { describe, it, expect } from "vitest";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";
import { SCENE_PLANNER_SYSTEM } from "@/lib/scene/prompts";

const cls = {
  scenario_cluster: "aesthetic_lifestyle" as const,
  risk_level: "low" as const,
  coherence_type: "aesthetic_series" as const,
  moderation_action: "allow" as const,
};

describe("anti-professional signals appear early in every prompt", () => {
  it("'no bokeh' / 'deep focus' appears in the first 400 chars (火山 5.0 偏好开头指令)", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      const head = shot.image_prompt.slice(0, 400).toLowerCase();
      expect(head).toMatch(/no bokeh|deep focus|no shallow depth|no portrait mode/);
    }
  });

  it("'no fashion editorial' / 'no dramatic lighting' explicit", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      const p = shot.image_prompt.toLowerCase();
      expect(p).toMatch(/no (fashion|magazine|editorial)/);
      expect(p).toMatch(/no (dramatic|cinematic|studio).*(light|lighting)|no professional lighting/);
    }
  });

  it("amateur snapshot cues: horizon tilt / off-center / casual framing", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      const p = shot.image_prompt.toLowerCase();
      // 至少一个 amateur 信号
      expect(p).toMatch(/horizon (slightly )?tilt|tilted horizon|subject (slightly )?off-center|off center|casual framing|approximate framing|low-effort framing|camera-roll/);
    }
  });

  it("explicit 'NOT a professional photographer' anchoring", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      expect(shot.image_prompt.toLowerCase()).toMatch(/not (a|by a) (professional )?photographer|non-photographer|friend|bystander/);
    }
  });
});

describe("SCENE_PLANNER_SYSTEM tightened against pro aesthetic", () => {
  it("system prompt mentions 'no portrait mode' / 'no model pose'", () => {
    const s = SCENE_PLANNER_SYSTEM.toLowerCase();
    expect(s).toMatch(/no portrait mode|no shallow depth|no model pose|no photoshoot/);
  });
});
