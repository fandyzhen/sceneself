// buildScenePlan v2.1 (两段式故事线引擎 + attire-driven continuity) 的 no-LLM fallback 路径:
// 不依赖 OpenRouter,产出 6 个互不相同的场景,每帧 prompt 含本帧场景。
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/scene/config", () => ({ sceneConfig: { textModel: "t" }, hasTextProviderKey: () => false }));
import { buildScenePlan } from "@/lib/scene/services/scene-planner";

describe("buildScenePlan v2.1 (fallback)", () => {
  it("古代场景:6 帧不同 + 造型非现代 + 全 friend_candid + 每帧含 era negative", async () => {
    const plan = await buildScenePlan("穿越古代当将军", {}, 6);
    expect(plan.shots).toHaveLength(6);
    expect(new Set(plan.shots.map(s => s.summary)).size).toBe(6);
    expect(plan.continuity.outfit.toLowerCase()).not.toContain("sweater");
    for (const s of plan.shots) expect(s.image_prompt.toLowerCase()).toMatch(/period-accurate|no modern/);
  });
  it("现代旅程:正常出 6 帧不同场景", async () => {
    const plan = await buildScenePlan("豪华游轮看鲸鱼", { tone: "惊喜高光" }, 6);
    expect(new Set(plan.shots.map(s => s.summary)).size).toBe(6);
  });
});
