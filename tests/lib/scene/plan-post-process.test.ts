// v2.1 planner(buildScenePlan) continuity 来自 generateStoryline 返回的 attire。
// ─────────────────────────────────────────────────────────────────────────────
// 变更说明(Task 5):
//   旧实现用 buildFallbackContinuity(safePrompt, answers) 决定 continuity,
//   新实现用 buildContinuityFromAttire(attire, safePrompt),attire 由 fallbackStoryline 按
//   storyline 类型派生。activity-aware styling 和颜色覆盖不再在 buildScenePlan 层发生，
//   而是由故事线引擎在 attire 字段中完成（LLM 路径）或 fallbackStoryline 提供合理默认。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { buildScenePlan } from "@/lib/scene/services/scene-planner";

describe("buildScenePlan(v2.1) — continuity 来自 attire", () => {
  it("running 场景: continuity.outfit 由 fallbackStoryline 提供的 modern attire 决定", async () => {
    const out = await buildScenePlan("Running in the park", {}, 6);
    // attire.outfit 是故事线引擎给的 — 不为空
    expect(out.continuity.outfit.length).toBeGreaterThan(0);
    // buildContinuityFromAttire 统一补全 jewelry / shoes / camera_style / film_look
    expect(out.continuity.jewelry.length).toBeGreaterThan(0);
    expect(out.continuity.shoes.length).toBeGreaterThan(0);
    expect(out.continuity.camera_style).toContain("iPhone");
    expect(out.continuity.film_look).toContain("natural daylight");
  });

  it("running accessory 由 attire.accessory 填充（非空）", async () => {
    const out = await buildScenePlan("Running in the park", {}, 6);
    expect(out.continuity.accessory.length).toBeGreaterThan(0);
  });

  it("hairstyle 由 attire.hairstyle 填充（非空）", async () => {
    const out = await buildScenePlan("Running in the park", {}, 6);
    expect(out.continuity.hairstyle.length).toBeGreaterThan(0);
  });
});

describe("buildScenePlan(v2.1) — 每帧携带 continuity 锁", () => {
  it("产出 6 个不同场景（each shot a different setting）", async () => {
    const out = await buildScenePlan("Running in the park", {}, 6);
    expect(out.shots).toHaveLength(6);
    expect(new Set(out.shots.map(s => s.summary)).size).toBe(6);
  });

  it("每帧 image_prompt 非空且包含场景信息", async () => {
    const out = await buildScenePlan("Running in the park", {}, 6);
    for (const shot of out.shots) {
      expect(shot.image_prompt.length).toBeGreaterThan(50);
      // 每帧都包含解剖学安全约束
      expect(shot.image_prompt.toLowerCase()).toContain("exactly two hands");
    }
  });

  it("每帧 image_prompt 包含 continuity.outfit 文字", async () => {
    const out = await buildScenePlan("Running in the park", {}, 6);
    const outfitFragment = out.continuity.outfit.slice(0, 10);
    for (const shot of out.shots) {
      expect(shot.image_prompt).toContain(outfitFragment);
    }
  });
});

describe("buildScenePlan(v2.1) — lifestyle 场景 continuity", () => {
  it("lifestyle 场景(cafe) continuity.outfit 非空、非运动装", async () => {
    const out = await buildScenePlan("morning coffee at a cafe", {}, 6);
    expect(out.continuity.outfit.length).toBeGreaterThan(0);
    // lifestyle fallback 给的是 modern casual，不包含古代/fantasy 关键词
    expect(out.continuity.outfit.toLowerCase()).not.toMatch(/armor|ancient|medieval|period costume/);
  });

  it("lifestyle 场景产出 6 帧不同场景", async () => {
    const out = await buildScenePlan("morning coffee at a cafe", {}, 6);
    expect(new Set(out.shots.map(s => s.summary)).size).toBe(6);
  });
});
