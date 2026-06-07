// 拉远到 "3-5 米手机拍" 感：
//   wide: face <8% (was 12%)
//   medium: face <18% (was 25%)
//   全部 image_prompt 出现"3-5 meters / standing back / phone away"
import { describe, it, expect } from "vitest";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";
import { buildScenePlan } from "@/lib/scene/services/scene-planner";
import { SCENE_PLANNER_SYSTEM } from "@/lib/scene/prompts";

const cls = {
  scenario_cluster: "aesthetic_lifestyle" as const,
  risk_level: "low" as const,
  coherence_type: "aesthetic_series" as const,
  moderation_action: "allow" as const,
};

describe("wide / medium face % tightened (further away)", () => {
  it("wide shot prompt forces face less than 8 percent", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    const wide = plan.shots.find(s => s.shot_size === "wide")!;
    expect(wide.image_prompt.toLowerCase()).toMatch(/less than 8%|under 8%|less than 8 percent/);
  });

  it("medium shot prompt forces face less than 18 percent (not 25)", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    const medium = plan.shots.find(s => s.shot_size === "medium")!;
    expect(medium.image_prompt.toLowerCase()).toMatch(/less than 18%|under 18%|less than 18 percent/);
  });
});

describe("3-5 meter phone-distance feel embedded in prompts", () => {
  it("every image_prompt mentions the 3-5m phone distance", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      expect(shot.image_prompt.toLowerCase()).toMatch(/2-?5\s*m|3-?5\s*m|5-?7\s*m|2-?3\s*m|3-?4\s*m|standing back|phone held back/);
    }
  });

  it("buildScenePlan(v2) also embeds the far phone distance in every frame", async () => {
    const out = await buildScenePlan("running in the park", {}, 6);
    for (const shot of out.shots) {
      expect(shot.image_prompt.toLowerCase()).toMatch(/2-?5\s*m|3-?5\s*m|5-?7\s*m|2-?3\s*m|3-?4\s*m|standing back/);
    }
  });
});

describe("SCENE_PLANNER_SYSTEM updated to enforce far distance", () => {
  it("system prompt mentions 3-5+ meter shooting distance", () => {
    expect(SCENE_PLANNER_SYSTEM.toLowerCase()).toMatch(/3-?5\s*m|5-?7\s*m|3 to 5 m|standing back/);
  });

  it("system prompt enforces face less than 8% in wide", () => {
    expect(SCENE_PLANNER_SYSTEM.toLowerCase()).toMatch(/less than 8%|under 8%/);
  });
});
