// 3 个修复测试：
//   1. shotSizeFor 不再返回 close（最后一张改 medium），避免 close-up identity fail
//   2. dropped rerun salvage 放宽：rerun 后 quality≥salvageMin 即接受（不强 same_person）
//   3. accessory 位置约束在 frame prompt 中前置
import { describe, it, expect } from "vitest";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";
import { runGeneration } from "@/lib/scene/orchestrator";
import type { OrchestratorDeps } from "@/lib/scene/orchestrator";
import type { QualityResult, SetCoherenceResult, ScenePlan } from "@/lib/scene/types";

const cls = { scenario_cluster: "aesthetic_lifestyle" as const, risk_level: "low" as const, coherence_type: "aesthetic_series" as const, moderation_action: "allow" as const };

describe("no close shot — every frame wide or medium", () => {
  it("6-shot plan has zero close shots", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    expect(plan.shots.filter(s => s.shot_size === "close")).toHaveLength(0);
  });

  it("4-shot plan also has zero close shots", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 4, {});
    expect(plan.shots.filter(s => s.shot_size === "close")).toHaveLength(0);
  });

  it("wide remains the dominant size (at least half)", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    expect(plan.shots.filter(s => s.shot_size === "wide").length).toBeGreaterThanOrEqual(3);
  });
});

describe("accessory position constraint surfaces early in the prompt", () => {
  it("the words 'centered in front' appear in the prompt head (first 800 chars) of every image_prompt", () => {
    const plan = buildFallbackScenePlan("running in the park", cls, 6, {});
    for (const shot of plan.shots) {
      const head = shot.image_prompt.slice(0, 800).toLowerCase();
      expect(head).toMatch(/centered in front|front of (the )?waist/);
    }
  });
});

const PASS: QualityResult = { same_person: true, deformity: false, plastic_skin: false, quality: 5, issues: [] };

function deps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    generateImage: async (shot, _r, seed) => ({ index: shot.index, imageUrl: `img-${shot.index}-${seed}` }),
    checkQuality: async () => PASS,
    swapFace: async () => null,
    checkSetCoherence: async (): Promise<SetCoherenceResult> => ({
      same_person_across_set: true, outfit_consistent: true, visual_style_consistent: true,
      coherence_type_followed: true, duplicate_compositions: false, deceptive_or_proof_like: false,
      set_quality: 5, weak_frames: [],
    }),
    qualityMin: 3,
    maxCandidates: 1,
    ...overrides,
  };
}

const plan: ScenePlan = buildFallbackScenePlan("running in the park", cls, 4, {});

describe("dropped rerun salvage is now quality-only (no strict same_person)", () => {
  it("when rerun returns quality>=salvageMin but same_person=false, frame still salvaged", async () => {
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      // 首批 frame 1 一直 identity fail；rerun 后 q=3, same_person=false（vision 误判）
      checkQuality: async (_s, candidate) => {
        if (candidate === "img-1-rescued") return { ...PASS, same_person: false, quality: 3 };
        return candidate.startsWith("img-1-") ? { ...PASS, same_person: false, quality: 2 } : PASS;
      },
      generateImage: async (shot, refs, seed) => {
        if (shot.index === 1 && seed.includes("rerun")) {
          expect(refs.some(u => u.startsWith("img-") && !u.startsWith("img-1-"))).toBe(true);
          return { index: 1, imageUrl: "img-1-rescued" };
        }
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
    }));
    const f1 = r.frames.find(f => f.index === 1)!;
    expect(f1.status).toBe("passed");
    expect(f1.imageUrl).toBe("img-1-rescued");
    expect(r.delivered).toBe(4);
  });

  it("but still rejects rerun with very low quality (q<salvageMin)", async () => {
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      checkQuality: async (_s, candidate) => {
        if (candidate === "img-1-rescued") return { ...PASS, same_person: false, quality: 1 }; // 太差
        return candidate.startsWith("img-1-") ? { ...PASS, same_person: false, quality: 2 } : PASS;
      },
      generateImage: async (shot, _refs, seed) => {
        if (shot.index === 1 && seed.includes("rerun")) return { index: 1, imageUrl: "img-1-rescued" };
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
    }));
    const f1 = r.frames.find(f => f.index === 1)!;
    expect(f1.status).toBe("dropped");
    expect(r.delivered).toBe(3);
  });
});
