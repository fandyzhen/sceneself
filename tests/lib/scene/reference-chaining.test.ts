// Reference chaining：先串行出第1帧作"组内视觉锚"，其余帧把它作为额外 reference 并发出图。
// 修复用户反馈："6张图里衣服不一致、背包跨的方向忽左忽右、座椅颜色不一致"。
import { runGeneration } from "@/lib/scene/orchestrator";
import type { OrchestratorDeps } from "@/lib/scene/orchestrator";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";
import type { QualityResult, SetCoherenceResult, SceneClassification } from "@/lib/scene/types";

const cls: SceneClassification = {
  scenario_cluster: "aesthetic_lifestyle",
  risk_level: "low",
  coherence_type: "aesthetic_series",
  moderation_action: "allow",
};
const PASS: QualityResult = { same_person: true, deformity: false, plastic_skin: false, quality: 5, issues: [] };
const COHERENCE: SetCoherenceResult = {
  same_person_across_set: true,
  outfit_consistent: true,
  visual_style_consistent: true,
  coherence_type_followed: true,
  duplicate_compositions: false,
  deceptive_or_proof_like: false,
  set_quality: 5,
  weak_frames: [],
};

function baseDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    generateImage: async (shot, _r, _seed) => ({ index: shot.index, imageUrl: `img-${shot.index}` }),
    checkQuality: async () => PASS,
    swapFace: async () => null,
    checkSetCoherence: async () => COHERENCE,
    qualityMin: 3,
    maxCandidates: 0,
    ...overrides,
  };
}

const plan = buildFallbackScenePlan("a cozy cafe morning", cls, 6, {});
const firstIndex = plan.shots[0].index;

describe("reference chaining", () => {
  it("first frame uses original refs; every other frame also sees the first frame's image", async () => {
    const refsByFrame: Record<number, string[]> = {};
    await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], baseDeps({
      referenceChaining: true,
      generateImage: async (shot, refs) => {
        refsByFrame[shot.index] = refs;
        return { index: shot.index, imageUrl: `img-${shot.index}` };
      },
    }));
    expect(refsByFrame[firstIndex]).toEqual(["selfie.jpg"]);
    for (const s of plan.shots.slice(1)) {
      expect(refsByFrame[s.index]).toContain(`img-${firstIndex}`);
      expect(refsByFrame[s.index]).toContain("selfie.jpg");
    }
  });

  it("without referenceChaining, no frame sees another frame's image (pure parallel)", async () => {
    const refsByFrame: Record<number, string[]> = {};
    await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], baseDeps({
      generateImage: async (shot, refs) => {
        refsByFrame[shot.index] = refs;
        return { index: shot.index, imageUrl: `img-${shot.index}` };
      },
    }));
    for (const s of plan.shots) {
      expect(refsByFrame[s.index]).toEqual(["selfie.jpg"]);
    }
  });

  it("falls back to original refs for the rest when the anchor frame is dropped", async () => {
    const refsByFrame: Record<number, string[]> = {};
    await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], baseDeps({
      referenceChaining: true,
      // 第1帧质检很差且非本人、换脸失败 → dropped，锚点缺失
      checkQuality: async (_s, candidate) =>
        candidate === `img-${firstIndex}` ? { ...PASS, same_person: false, quality: 1 } : PASS,
      generateImage: async (shot, refs) => {
        refsByFrame[shot.index] = refs;
        return { index: shot.index, imageUrl: `img-${shot.index}` };
      },
    }));
    // 锚帧没出来，其余帧退回只用原始 selfie 参考（不含任何 img-*）
    for (const s of plan.shots.slice(1)) {
      expect(refsByFrame[s.index]).toEqual(["selfie.jpg"]);
    }
  });
});
