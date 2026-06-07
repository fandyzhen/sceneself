import { describe, it, expect } from "vitest";
import { runGeneration } from "@/lib/scene/orchestrator";
import type { OrchestratorDeps } from "@/lib/scene/orchestrator";
import type { ScenePlan, QualityResult, SetCoherenceResult } from "@/lib/scene/types";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";

// 用户反馈："遮挡部分占比合理 + 露出部分能识别就该放行"。
// 路径 2：遮挡 outfit 场景下，把 identityOverrideQuality 从 4 调到 qualityMin (3)，
// 让 quality 过 qualityMin 就接受 not same_person 误判,呼应 prompt 端 face crop 放大。

const COH_PASS: SetCoherenceResult = {
  same_person_across_set: true,
  outfit_consistent: true,
  visual_style_consistent: true,
  coherence_type_followed: true,
  duplicate_compositions: false,
  deceptive_or_proof_like: false,
  set_quality: 5,
  weak_frames: [],
};

const basePlan = buildFallbackScenePlan(
  "imagined Dubai travel photo set",
  { scenario_cluster: "destination_travel", risk_level: "low", coherence_type: "time_arc", moderation_action: "allow" },
  3,
  {},
);

function planWithOutfit(outfit: string): ScenePlan {
  return { ...basePlan, continuity: { ...basePlan.continuity, outfit } };
}

function deps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    generateImage: async (shot, _refs, seed) => ({ index: shot.index, imageUrl: `img-${shot.index}-${seed}` }),
    checkQuality: async () => ({
      same_person: false,
      deformity: false,
      plastic_skin: false,
      quality: 3,
      issues: [],
    } as QualityResult),
    swapFace: async () => null,
    checkSetCoherence: async () => COH_PASS,
    qualityMin: 3,
    maxCandidates: 1,
    rescueAttempts: 0,
    ...overrides,
  };
}

describe("遮挡 outfit → identity 容错放宽（路径 2）", () => {
  it("非遮挡 outfit + quality=qualityMin + not same_person → dropped（默认 override=4 不生效）", async () => {
    const plan = planWithOutfit("charcoal grey wool overcoat, dark blue denim jeans, black leather chelsea boots");
    const r = await runGeneration(plan, "selfie.jpg", [], deps());
    expect(r.frames.every(f => f.status === "dropped" && f.failReason === "identity")).toBe(true);
  });

  it("含 helmet → quality=qualityMin + not same_person → passed（occluded override 生效）", async () => {
    const plan = planWithOutfit("polished silver helmet, black scale armor, crimson silk war robe, brown leather boots");
    const r = await runGeneration(plan, "selfie.jpg", [], deps());
    expect(r.status).toBe("completed");
    expect(r.frames.every(f => f.status === "passed")).toBe(true);
  });

  it("含 scrub cap（医生）→ 同样放宽", async () => {
    const plan = planWithOutfit("light blue surgical scrub cap, light blue scrub top, light blue scrub trousers, white clogs");
    const r = await runGeneration(plan, "selfie.jpg", [], deps());
    expect(r.status).toBe("completed");
  });

  it("含 chef toque → 同样放宽", async () => {
    const plan = planWithOutfit("white chef's toque, white chef coat, blue houndstooth pants, black non-slip clogs");
    const r = await runGeneration(plan, "selfie.jpg", [], deps());
    expect(r.status).toBe("completed");
  });

  it("遮挡场景 + quality<qualityMin (图本身糊) + not same_person → 仍 dropped（quality 底线不破）", async () => {
    // 注:用户产品判断"露出部分能识别就放行"针对 identity 判定;quality 是图本身的画质底线,
    // 含遮挡场景下也不该破。occludedOverride 只影响 same_person 那一关。
    const plan = planWithOutfit("polished silver helmet, black scale armor");
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async () => ({
        same_person: false, deformity: false, plastic_skin: false, quality: 2, issues: [],
      } as QualityResult),
    }));
    expect(r.frames.every(f => f.status === "dropped")).toBe(true);
  });

  it("遮挡场景 + same_person=true → 当然 passed（无影响）", async () => {
    const plan = planWithOutfit("polished silver helmet, black armor");
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async () => ({
        same_person: true, deformity: false, plastic_skin: false, quality: 3, issues: [],
      } as QualityResult),
    }));
    expect(r.status).toBe("completed");
  });

  it("遮挡场景 + 畸形 → 仍 dropped（畸形不该放）", async () => {
    const plan = planWithOutfit("polished silver helmet, black armor");
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async () => ({
        same_person: false, deformity: true, plastic_skin: false, quality: 5, issues: [],
      } as QualityResult),
    }));
    expect(r.frames.every(f => f.status === "dropped")).toBe(true);
  });
});
