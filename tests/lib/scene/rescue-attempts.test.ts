// 验证 v3 dropped 帧救援增强:
//  1. resolveFrame 单次 generate / checkQuality throw 不整 frame 崩(continue 下个 attempt)
//  2. dropped 帧多次救援(rescueAttempts),成功即停,不浪费
//  3. 全 dropped 时也能救援(不再依赖 kept 非空)
import { describe, it, expect } from "vitest";
import { runGeneration } from "@/lib/scene/orchestrator";
import type { OrchestratorDeps } from "@/lib/scene/orchestrator";
import type { QualityResult, SetCoherenceResult } from "@/lib/scene/types";
import { buildFallbackScenePlan } from "@/lib/scene/scene-plan";

const PASS: QualityResult = { same_person: true, deformity: false, plastic_skin: false, quality: 5, issues: [] };
const FAIL_IDENTITY: QualityResult = { ...PASS, same_person: false, quality: 2 };
// 用于测试"救援也不通过"场景:quality=1 < salvageMin(2) → 救援层会拒绝。
const FAIL_HARD: QualityResult = { ...PASS, same_person: false, quality: 1 };

const COHERENCE_OK: SetCoherenceResult = {
  same_person_across_set: true,
  outfit_consistent: true,
  visual_style_consistent: true,
  coherence_type_followed: true,
  duplicate_compositions: false,
  deceptive_or_proof_like: false,
  set_quality: 5,
  weak_frames: [],
};

const plan = buildFallbackScenePlan(
  "running in the park",
  { scenario_cluster: "aesthetic_lifestyle", risk_level: "low", coherence_type: "aesthetic_series", moderation_action: "allow" },
  4,
  {},
);

function deps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    generateImage: async (shot, _r, seed) => ({ index: shot.index, imageUrl: `img-${shot.index}-${seed}` }),
    checkQuality: async () => PASS,
    swapFace: async () => null,
    checkSetCoherence: async () => COHERENCE_OK,
    qualityMin: 3,
    maxCandidates: 1,
    ...overrides,
  };
}

describe("resolveFrame: 单次 generate/checkQuality throw 不整 frame 崩", () => {
  it("attempt 0 generateImage 抛错 → attempt 1 retry 成功 → 该 frame 标 passed", async () => {
    let frame1Attempts = 0;
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      generateImage: async (shot, _r, seed) => {
        if (shot.index === 1) {
          frame1Attempts++;
          if (frame1Attempts === 1) throw new Error("API timeout on first attempt");
          return { index: 1, imageUrl: "img-1-retried" };
        }
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
    }));
    expect(frame1Attempts).toBe(2); // 第 1 次 throw,第 2 次成功
    const f1 = r.frames.find(f => f.index === 1)!;
    expect(f1.status).toBe("passed");
    expect(f1.imageUrl).toBe("img-1-retried");
  });

  it("checkQuality 抛错 → 视为该 candidate 失败,继续 attempt 1", async () => {
    let qcCalls = 0;
    await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      checkQuality: async (_s, url) => {
        if (url === "img-1-1-0") { // attempt 0 的 url 形式
          qcCalls++;
          throw new Error("vision LLM rate limit");
        }
        qcCalls++;
        return PASS;
      },
    }));
    expect(qcCalls).toBeGreaterThan(0); // 不整体崩
  });
});

describe("dropped 帧救援多次重试", () => {
  it("rescueAttempts=2: 第一次救援仍 fail,第二次成功 → 该 frame 救回", async () => {
    let frame1RerunAttempts = 0;
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      rescueAttempts: 2,
      checkQuality: async (_s, candidate) => {
        // frame 1 首批 + 救援第 1 次 quality 极低(救援层也拒);救援第 2 次才通过
        if (candidate === "img-1-rerun2-passed") return PASS;
        if (candidate === "img-1-rerun1-fail") return FAIL_HARD; // q=1 < salvageMin → 救援拒
        if (candidate.startsWith("img-1-")) return FAIL_IDENTITY;
        return PASS;
      },
      generateImage: async (shot, _refs, seed) => {
        if (shot.index === 1 && seed.includes("rerun")) {
          frame1RerunAttempts++;
          if (frame1RerunAttempts === 1) return { index: 1, imageUrl: "img-1-rerun1-fail" };
          return { index: 1, imageUrl: "img-1-rerun2-passed" };
        }
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
    }));
    expect(frame1RerunAttempts).toBe(2); // 救援跑了 2 次
    const f1 = r.frames.find(f => f.index === 1)!;
    expect(f1.status).toBe("passed");
    expect(f1.imageUrl).toBe("img-1-rerun2-passed");
  });

  it("rescueAttempts=3: 第一次救援就成功 → 后续 attempts 不再跑(成功即停)", async () => {
    let frame1RerunAttempts = 0;
    await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      rescueAttempts: 3,
      checkQuality: async (_s, candidate) => candidate.startsWith("img-1-") && !candidate.includes("rerun") ? FAIL_IDENTITY : PASS,
      generateImage: async (shot, _r, seed) => {
        if (shot.index === 1 && seed.includes("rerun")) frame1RerunAttempts++;
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
    }));
    expect(frame1RerunAttempts).toBe(1); // 第 1 次救援就成功,后 2 次没跑
  });

  it("救援 generateImage throw → 算该次失败,继续下次", async () => {
    let frame1RerunAttempts = 0;
    await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      rescueAttempts: 2,
      checkQuality: async (_s, candidate) => {
        if (candidate === "img-1-rerun-2-ok") return PASS;
        return candidate.startsWith("img-1-") ? FAIL_IDENTITY : PASS;
      },
      generateImage: async (shot, _r, seed) => {
        if (shot.index === 1 && seed.includes("rerun")) {
          frame1RerunAttempts++;
          if (frame1RerunAttempts === 1) throw new Error("rescue attempt 1 timeout");
          return { index: 1, imageUrl: "img-1-rerun-2-ok" };
        }
        return { index: shot.index, imageUrl: `img-${shot.index}-${seed}` };
      },
    }));
    expect(frame1RerunAttempts).toBe(2); // 第 1 throw,第 2 成功
  });
});

describe("时间预算额外救援(超出基础 rescueAttempts)", () => {
  // 帧1需要 4 次救援才过;其它帧第一次救援即过。
  // 注意:救援层接受 quality >= salvageMin(2),所以"仍不过"必须用 FAIL_HARD(quality=1)才会被拒。
  const makeQuality = (counter: { n: number }) => async (_s: string, candidate: string) => {
    if (candidate.includes("rerun")) {
      if (candidate.startsWith("img-1-")) {
        counter.n++;
        return counter.n >= 4 ? PASS : FAIL_HARD; // 第 4 次救援才过(前 3 次 quality=1 被救援层拒)
      }
      return PASS; // 其它帧救援即过
    }
    return FAIL_IDENTITY; // 首批全 fail(quality=2<qualityMin=3 → 初始 drop)
  };

  it("注入 timeBudgetMs → 基础轮跑完仍 dropped 时,额外轮继续直到救成 6/6", async () => {
    const c = { n: 0 };
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      rescueAttempts: 1,
      timeBudgetMs: 100_000, // 充足预算
      rescueRoundMs: 1,      // 阈值极小,instant mock 下持续补救
      checkQuality: makeQuality(c),
    }));
    expect(c.n).toBeGreaterThanOrEqual(4); // 基础 1 轮 + 额外 ≥3 轮
    expect(r.delivered).toBe(4);
    expect(r.status).toBe("completed");
  });

  it("不注入 timeBudgetMs → 只跑基础轮,救不回就停(行为不变)", async () => {
    const c = { n: 0 };
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      rescueAttempts: 1,
      // 无 timeBudgetMs → 无额外轮
      checkQuality: makeQuality(c),
    }));
    expect(c.n).toBe(1); // 只基础 1 轮
    expect(r.frames.find(f => f.index === 1)!.status).toBe("dropped");
    expect(r.delivered).toBe(3);
    expect(r.status).toBe("partial");
  });

  it("剩余时间不足 0.5×单轮 → 不开新额外轮", async () => {
    const c = { n: 0 };
    // timeBudgetMs 极小(0),第一次额外轮前 remaining<阈值 → 不补,保持基础结果。
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      rescueAttempts: 1,
      timeBudgetMs: 1,        // 预算几乎为 0
      rescueRoundMs: 20_000,  // 阈值 10s,远大于剩余 → 不开额外轮
      checkQuality: makeQuality(c),
    }));
    expect(c.n).toBe(1); // 只基础 1 轮,无额外
    expect(r.delivered).toBe(3);
  });
});

describe("全 dropped 时也能救援(不依赖 kept 非空)", () => {
  it("所有帧首批都 fail,救援仍尝试且能救成 partial → completed", async () => {
    const rescueResults = new Set<string>();
    const r = await runGeneration(plan, "selfie.jpg", ["selfie.jpg"], deps({
      rescueAttempts: 1,
      checkQuality: async (_s, candidate) => {
        if (candidate.includes("rerun")) {
          rescueResults.add(candidate);
          return PASS; // 救援都通过
        }
        return FAIL_IDENTITY; // 首批全 fail
      },
    }));
    expect(rescueResults.size).toBe(4); // 4 帧都触发救援
    expect(r.delivered).toBe(4);
    expect(r.status).toBe("completed");
  });
});
