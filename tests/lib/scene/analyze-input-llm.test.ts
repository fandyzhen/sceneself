// LLM 路径：让 LLM 把"变身大厨"(中文意图=想当现代厨师)正确归到 profession,
// 而不是 fantasy_role/transformation。同时验证 LLM 返回非法 id 时 fallback 到正则。
import { describe, it, expect, vi } from "vitest";

const createOpenRouterChat = vi.fn();
vi.mock("@/lib/openrouter/chat", () => ({
  createOpenRouterChat: (...args: unknown[]) => createOpenRouterChat(...args),
}));
vi.mock("@/lib/scene/config", () => ({
  sceneConfig: { textModel: "t" },
  hasTextProviderKey: () => true,
}));
import { analyzeInput } from "@/lib/scene/services/scene-planner";

describe("analyzeInput (LLM path)", () => {
  it("LLM 返回 profession → 识别真实意图(变身大厨=想当现代厨师)", async () => {
    createOpenRouterChat.mockResolvedValueOnce('{"storyline_type":"profession"}');
    const r = await analyzeInput("变身大厨");
    expect(r.storyline_type).toBe("profession");
  });

  it("LLM 返回非法 storyline_type → fallback 到正则(getStorylineType)", async () => {
    // 非法 id 触发 fallback；"去三亚旅行"经规则会判为 journey。
    createOpenRouterChat.mockResolvedValueOnce('{"storyline_type":"garbage_type"}');
    const r = await analyzeInput("去三亚旅行");
    expect(r.storyline_type).toBe("journey");
  });

  it("LLM 抛错 → fallback 到正则", async () => {
    createOpenRouterChat.mockRejectedValueOnce(new Error("network"));
    const r = await analyzeInput("我买了一架私人直升机");
    expect(r.storyline_type).toBe("ownership_flex");
  });
});
