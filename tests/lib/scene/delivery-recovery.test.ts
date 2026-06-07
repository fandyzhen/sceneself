// 三个修复测试：
//   1. detectActivity 必须命中 "run in the park"（翻译后的中文跑步）
//   2. orchestrator 重跑路径必须救 dropped 帧（不是 passed weak 帧）
//   3. quality check 在 wide shot 时不能因 face 小直接判 same_person=false
import { describe, it, expect } from "vitest";
import { detectActivity } from "@/lib/scene/scene-plan";
import { runGeneration } from "@/lib/scene/orchestrator";
import type { OrchestratorDeps } from "@/lib/scene/orchestrator";
import type { QualityResult, SetCoherenceResult } from "@/lib/scene/types";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";

describe("detectActivity catches plain 'run' (Chinese translation often drops -ing)", () => {
  it("matches 'run in the park'", () => {
    expect(detectActivity("Causing someone to run in the park.")).toBe("running");
  });

  it("matches plain 'a quick run'", () => {
    expect(detectActivity("a quick run after work")).toBe("running");
  });

  it("matches 'runner' / 'runners'", () => {
    expect(detectActivity("morning runner vibe")).toBe("running");
    expect(detectActivity("two runners along the river")).toBe("running");
  });

  it("still recognises 'running' / 'jogging'", () => {
    expect(detectActivity("running on the beach")).toBe("running");
    expect(detectActivity("jogging at dawn")).toBe("running");
  });

  it("does NOT match other 'run' verb senses (run a business, run for office)", () => {
    expect(detectActivity("run for office in DC")).toBeNull();
    expect(detectActivity("run a business meeting")).toBeNull();
  });
});

const plan = buildFallbackScenePlan(
  "running in the park",
  { scenario_cluster: "aesthetic_lifestyle", risk_level: "low", coherence_type: "aesthetic_series", moderation_action: "allow" },
  4,
  {},
);

const PASS: QualityResult = { same_person: true, deformity: false, plastic_skin: false, quality: 5, issues: [] };
const FAIL_IDENTITY: QualityResult = { ...PASS, same_person: false, quality: 2 };

function deps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    generateImage: async (shot, _r, seed) => ({ index: shot.index, imageUrl: `img-${shot.index}-${seed}` }),
    checkQuality: async () => PASS,
    swapFace: async () => null,
    checkSetCoherence: async (): Promise<SetCoherenceResult> => ({
      same_person_across_set: true,
      outfit_consistent: true,
      visual_style_consistent: true,
      coherence_type_followed: true,
      duplicate_compositions: false,
      deceptive_or_proof_like: false,
      set_quality: 5,
      weak_frames: [],
    }),
    qualityMin: 3,
    maxCandidates: 1,
    ...overrides,
  };
}

describe("orchestrator rerun targets DROPPED frames, not passed weak frames", () => {
  it("when a frame is dropped (identity fail), rerun once using a passed frame as reference", async () => {
    let frame1Reruns = 0;
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      checkQuality: async (_s, candidate) => {
        // 救援后的 URL 视为通过；首批 frame 1 任何尝试都 identity fail
        if (candidate === "img-1-rescued") return PASS;
        return candidate.startsWith("img-1-") ? FAIL_IDENTITY : PASS;
      },
      generateImage: async (shot, refs, seed) => {
        if (shot.index === 1 && seed.includes("rerun")) {
          frame1Reruns++;
          // 重跑时必须有"已通过帧的 URL"作为额外 reference
          expect(refs.some(u => u.startsWith("img-") && !u.startsWith("img-1-"))).toBe(true);
          return { index: 1, imageUrl: "img-1-rescued" };
        }
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
      checkSetCoherence: async (): Promise<SetCoherenceResult> => ({
        same_person_across_set: true,
        outfit_consistent: true,
        visual_style_consistent: true,
        coherence_type_followed: true,
        duplicate_compositions: false,
        deceptive_or_proof_like: false,
        set_quality: 5,
        weak_frames: [], // ← LLM 没标 weak，但我们仍要救 dropped 帧
      }),
    }));
    expect(frame1Reruns).toBe(1);
    const f1 = r.frames.find(f => f.index === 1)!;
    expect(f1.status).toBe("passed");
    expect(f1.imageUrl).toBe("img-1-rescued");
    expect(r.delivered).toBe(4);
    expect(r.status).toBe("completed");
  });

  it("does NOT rerun passed frames flagged by LLM as weak (saves time, no win)", async () => {
    let nonDroppedReruns = 0;
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      generateImage: async (shot, _r, seed) => {
        if (seed.includes("rerun") && shot.index !== 99) nonDroppedReruns++;
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
      checkSetCoherence: async (): Promise<SetCoherenceResult> => ({
        same_person_across_set: true,
        outfit_consistent: true,
        visual_style_consistent: true,
        coherence_type_followed: true,
        duplicate_compositions: false,
        deceptive_or_proof_like: false,
        set_quality: 3,
        weak_frames: [2, 4], // ← LLM 标 weak，但 frames 都是 passed，不应该重跑
      }),
    }));
    expect(nonDroppedReruns).toBe(0);
    expect(r.delivered).toBe(4);
  });

  it("does nothing if all frames passed and none dropped", async () => {
    let calls = 0;
    await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      generateImage: async (shot, _r, seed) => {
        calls++;
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
    }));
    expect(calls).toBe(4); // 每帧 1 候选，无重跑
  });
});
