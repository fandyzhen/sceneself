import { validateScenePlan, buildFallbackScenePlan } from "@/lib/scene/scene-plan";
import type { SceneClassification } from "@/lib/scene/types";

const travel: SceneClassification = {
  scenario_cluster: "destination_travel",
  risk_level: "low",
  coherence_type: "time_arc",
  moderation_action: "allow",
};

describe("buildFallbackScenePlan", () => {
  it("builds a plan whose shot count matches the requested tier", () => {
    const plan = buildFallbackScenePlan("imagined Dubai travel photo set", travel, 4, {});
    expect(plan.shots).toHaveLength(4);
    expect(plan.scenario_cluster).toBe("destination_travel");
    expect(plan.coherence_type).toBe("time_arc");
  });

  it("produces a 9-shot plan that passes validation with distinct roles", () => {
    const plan = buildFallbackScenePlan("imagined Dubai travel photo set", travel, 9, {});
    expect(validateScenePlan(plan, 9).valid).toBe(true);
  });

  it("defaults shot sizes to medium/wide to avoid close-up faces (SPEC 5.8)", () => {
    const plan = buildFallbackScenePlan("imagined Dubai travel photo set", travel, 9, {});
    const closeUps = plan.shots.filter(s => s.shot_size === "close").length;
    expect(closeUps).toBeLessThanOrEqual(2);
  });
});

describe("validateScenePlan", () => {
  const base = () => buildFallbackScenePlan("imagined Dubai travel photo set", travel, 4, {});

  it("accepts a well-formed plan", () => {
    expect(validateScenePlan(base(), 4).valid).toBe(true);
  });

  it("rejects a plan whose shot count mismatches the tier", () => {
    expect(validateScenePlan(base(), 9).valid).toBe(false);
  });

  it("rejects duplicate narrative roles", () => {
    const plan = base();
    plan.shots[1].narrative_role = plan.shots[0].narrative_role;
    expect(validateScenePlan(plan, 4).valid).toBe(false);
  });

  it("rejects a blocked risk level (must not enter generation)", () => {
    const plan = base();
    plan.risk_level = "blocked";
    expect(validateScenePlan(plan, 4).valid).toBe(false);
  });

  it("rejects an invalid coherence type", () => {
    const plan = base();
    // @ts-expect-error 故意写入非法值
    plan.coherence_type = "random_thing";
    expect(validateScenePlan(plan, 4).valid).toBe(false);
  });

  it("rejects a shot missing its image prompt", () => {
    const plan = base();
    plan.shots[0].image_prompt = "";
    expect(validateScenePlan(plan, 4).valid).toBe(false);
  });
});
