// 激进 anti-pro：拉到 5-7m + 限制 person body 占比 + 平光要求 + 禁止 backlit。
import { describe, it, expect } from "vitest";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";

const cls = {
  scenario_cluster: "aesthetic_lifestyle" as const,
  risk_level: "low" as const,
  coherence_type: "aesthetic_series" as const,
  moderation_action: "allow" as const,
};

describe("wide pulled to 5-7 meters (further than 3-5m)", () => {
  it("wide shot guidance mentions 5-7 meters away", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    const wide = plan.shots.find(s => s.shot_size === "wide")!;
    expect(wide.image_prompt.toLowerCase()).toMatch(/5-?7\s*m|5 to 7 m/);
  });

  it("medium pulled to 3-4 meters", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    const medium = plan.shots.find(s => s.shot_size === "medium")!;
    expect(medium.image_prompt.toLowerCase()).toMatch(/3-?4\s*m|3 to 4 m/);
  });
});

describe("person body size cap (not just face)", () => {
  it("wide shot prompt limits person body height to under 40% of frame", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    const wide = plan.shots.find(s => s.shot_size === "wide")!;
    expect(wide.image_prompt.toLowerCase()).toMatch(/person.*(less than 40%|under 40%|small.*frame)|body.*(less than 40%|under 40%)/);
  });
});

describe("anti-backlit / anti-golden-hour requirements", () => {
  it("no backlit / no rim light explicit in every prompt", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      const p = shot.image_prompt.toLowerCase();
      expect(p).toMatch(/no backlit|no back-lit|no rim light|no silhouette light/);
    }
  });

  it("flat/midday/overcast positive lighting cue in every prompt", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      const p = shot.image_prompt.toLowerCase();
      expect(p).toMatch(/flat.*(daylight|midday)|overcast|cloudy|harsh midday|boring (flat )?light/);
    }
  });

  it("explicit no sunset / no sunrise / no golden hour", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      const p = shot.image_prompt.toLowerCase();
      expect(p).toMatch(/no sunset|no sunrise|no golden hour|no warm sunset/);
    }
  });
});
