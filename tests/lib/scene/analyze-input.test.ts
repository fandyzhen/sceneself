import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/openrouter/chat", () => ({ createOpenRouterChat: vi.fn().mockRejectedValue(new Error("no key path")) }));
vi.mock("@/lib/scene/config", () => ({ sceneConfig: { textModel: "t" }, hasTextProviderKey: () => false }));
import { analyzeInput } from "@/lib/scene/services/scene-planner";

describe("analyzeInput (fallback path, no LLM)", () => {
  it("据关键词判 storyline_type + 给该类的调性预选与侧重选项", async () => {
    const r = await analyzeInput("我买了一架私人直升机");
    expect(r.storyline_type).toBe("ownership_flex");
    expect(r.tone_suggestions.length).toBe(1); // 只推荐 1 个(用户反馈:推荐 2 个+金边易被误以为已选)
    expect(r.focus_options.length).toBeGreaterThanOrEqual(3);
  });
  it("旅程类兜底", async () => {
    const r = await analyzeInput("去三亚旅行");
    expect(r.storyline_type).toBe("journey");
  });
});
