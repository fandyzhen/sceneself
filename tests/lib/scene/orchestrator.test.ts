import { runGeneration } from "@/lib/scene/orchestrator";
import type { OrchestratorDeps } from "@/lib/scene/orchestrator";
import type { QualityResult, SetCoherenceResult } from "@/lib/scene/types";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";

const plan = buildFallbackScenePlan(
  "imagined Dubai travel photo set",
  { scenario_cluster: "destination_travel", risk_level: "low", coherence_type: "time_arc", moderation_action: "allow" },
  4,
  {},
);

const PASS: QualityResult = { same_person: true, deformity: false, plastic_skin: false, quality: 5, issues: [] };
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

function deps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    generateImage: async (shot, _refs, seed) => ({ index: shot.index, imageUrl: `img-${shot.index}-${seed}` }),
    checkQuality: async () => PASS,
    swapFace: async () => null,
    checkSetCoherence: async () => COH_PASS,
    qualityMin: 3,
    maxCandidates: 3,
    ...overrides,
  };
}

describe("runGeneration", () => {
  it("delivers all frames and marks completed when every frame passes", async () => {
    const r = await runGeneration(plan, "selfie.jpg", [], deps());
    expect(r.status).toBe("completed");
    expect(r.delivered).toBe(4);
    expect(r.frames.every(f => f.status === "passed")).toBe(true);
  });

  it("selects exactly one cover among passed frames", async () => {
    const r = await runGeneration(plan, "selfie.jpg", [], deps());
    expect(r.frames.filter(f => f.isCover)).toHaveLength(1);
  });

  it("retries a failing frame with extra candidates, then passes", async () => {
    let firstFrameOneFailed = false;
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async (_s, candidate) => {
        if (candidate.startsWith("img-1-") && !firstFrameOneFailed) {
          firstFrameOneFailed = true;
          return { ...PASS, same_person: false, quality: 1 };
        }
        return PASS;
      },
    }));
    const f1 = r.frames.find(f => f.index === 1)!;
    expect(f1.status).toBe("passed");
    expect(f1.candidatesTried).toBeGreaterThan(1);
  });

  it("drops a frame whose every candidate (including dropped-rerun) is below salvage quality", async () => {
    // quality=1 < salvageMin(=2)，所有候选和 rerun 都过不了 → 真的 dropped
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async (_s, candidate) =>
        candidate.startsWith("img-2-") ? { ...PASS, same_person: false, quality: 1 } : PASS,
    }));
    const f2 = r.frames.find(f => f.index === 2)!;
    expect(f2.status).toBe("dropped");
    expect(f2.failReason).toBe("identity");
    expect(r.status).toBe("partial");
    expect(r.delivered).toBe(3);
  });

  it("marks a realism failure (face ok, artifacts) as dropped realism", async () => {
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async (_s, candidate) =>
        candidate.startsWith("img-3-") ? { ...PASS, deformity: true, quality: 1 } : PASS,
    }));
    const f3 = r.frames.find(f => f.index === 3)!;
    expect(f3.status).toBe("dropped");
    expect(f3.failReason).toBe("realism");
  });

  it("recovers an identity failure via face swap when available", async () => {
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async (_s, candidate) =>
        candidate.startsWith("img-2-") ? { ...PASS, same_person: false, quality: 2 } : PASS,
      swapFace: async () => ({ imageUrl: "swapped-2.jpg" }),
    }));
    const f2 = r.frames.find(f => f.index === 2)!;
    expect(f2.status).toBe("swapped");
    expect(f2.imageUrl).toBe("swapped-2.jpg");
    expect(r.delivered).toBe(4);
  });

  it("never tries more candidates than maxCandidates allows", async () => {
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      checkQuality: async () => ({ ...PASS, same_person: false, quality: 1 }),
      maxCandidates: 2,
    }));
    const f = r.frames[0];
    expect(f.candidatesTried).toBeLessThanOrEqual(3); // 首次 + 最多 2 次重抽
  });

  // 组图模式（SPEC 5.4）
  it("uses the set image for the first attempt and skips single-gen when it passes", async () => {
    let singleGenCalls = 0;
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      generateSet: async p => new Map(p.shots.map(s => [s.index, `set-${s.index}.jpg`])),
      generateImage: async (shot, _r, seed) => {
        singleGenCalls++;
        return { index: shot.index, imageUrl: `single-${shot.index}-${seed}` };
      },
    }));
    expect(r.frames.every(f => f.imageUrl?.startsWith("set-"))).toBe(true);
    expect(singleGenCalls).toBe(0);
    expect(r.status).toBe("completed");
  });

  it("retries with single-gen when a set frame fails quality", async () => {
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      generateSet: async p => new Map(p.shots.map(s => [s.index, `set-${s.index}.jpg`])),
      checkQuality: async (_s, url) => (url.startsWith("set-2.jpg") ? { ...PASS, same_person: false, quality: 1 } : PASS),
      generateImage: async shot => ({ index: shot.index, imageUrl: `single-${shot.index}` }),
    }));
    const f2 = r.frames.find(f => f.index === 2)!;
    expect(f2.status).toBe("passed");
    expect(f2.imageUrl).toBe("single-2");
    expect(f2.candidatesTried).toBeGreaterThan(1);
  });

  // v2 提速：每帧完成即揭晓，慢帧不得阻塞快帧的 onFrame 落库
  it("reveals each frame via onFrame as soon as it finishes (slow frame does not block fast ones)", async () => {
    const revealed: number[] = [];
    await runGeneration(plan, "selfie.jpg", [], deps({
      generateImage: async (shot, _r, seed) => {
        if (shot.index === 1) await new Promise(res => setTimeout(res, 60));
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
      onFrame: async o => {
        revealed.push(o.index);
      },
    }));
    const first = (i: number) => revealed.indexOf(i);
    // 慢帧 1 的首次揭晓必须晚于快帧 2/3/4
    expect(first(1)).toBeGreaterThan(first(2));
    expect(first(1)).toBeGreaterThan(first(3));
    expect(first(1)).toBeGreaterThan(first(4));
  });

  // v2：封面通过独立 onCover 回调补标，避免重复 onFrame（防止重复 R2 上传）
  it("marks the cover through a dedicated onCover callback after all frames settle", async () => {
    let coverIndex = -1;
    const r = await runGeneration(plan, "selfie.jpg", [], deps({
      onCover: async (index: number) => {
        coverIndex = index;
      },
    }));
    const cover = r.frames.find(f => f.isCover)!;
    expect(coverIndex).toBe(cover.index);
  });
});
