// clarify route 集成:走 rewriteIntent + screenPrompt + analyzeInput 链路,
// 返回前端需要的 storyline_type/tone_suggestions/focus_options。
// 用 vi.mock 替换重写/审核/翻译,只验路由编排 + analyzeInput 真出。
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openrouter/chat", () => ({
  createOpenRouterChat: vi.fn().mockRejectedValue(new Error("no key in test")),
}));
vi.mock("@/lib/scene/config", () => ({
  sceneConfig: { textModel: "t", visionModel: "v" },
  hasTextProviderKey: () => false,
  shotCountForTier: () => 6,
}));
vi.mock("@/lib/scene/services/translation", () => ({
  normalizePromptForPlanning: vi.fn(async (raw: string) => ({
    workingPrompt: raw,
    originalLanguage: "en",
    wasTranslated: false,
  })),
}));
vi.mock("@/lib/scene/services/intent-rewriter", () => ({
  rewriteIntent: vi.fn(async ({ rawPrompt }: { rawPrompt: string }) => ({
    safePrompt: rawPrompt,
    rewriteApplied: false,
    rewriteReason: "none",
    userNotice: null,
  })),
}));
vi.mock("@/lib/scene/services/prompt-moderation", () => ({
  screenPrompt: vi.fn(async () => ({ decision: "allow", action: "allow" })),
  isBlocked: () => false,
}));

import { POST } from "@/app/api/scene/clarify/route";

function mkReq(body: unknown) {
  return new Request("http://localhost/api/scene/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("/api/scene/clarify (Plan B contract)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ownership_flex 输入 → 返回 storyline_type + tone_suggestions + focus_options", async () => {
    const res = await POST(mkReq({ rawPrompt: "我买了一架私人直升机" }));
    const data = await res.json();
    expect(data.safePrompt).toBe("我买了一架私人直升机");
    expect(data.storyline_type).toBe("ownership_flex");
    expect(Array.isArray(data.tone_suggestions)).toBe(true);
    expect(data.tone_suggestions.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.focus_options)).toBe(true);
    expect(data.focus_options.length).toBeGreaterThanOrEqual(3);
    // 旧契约的 questions/classification 不再返回(或为空)
    expect(data.questions).toBeUndefined();
  });

  it("journey 兜底 → 仍返回三段载荷", async () => {
    const res = await POST(mkReq({ rawPrompt: "去三亚旅行" }));
    const data = await res.json();
    // safePrompt 原样返回 → 证明 rewriteIntent mock 生效(未被真实改写)
    expect(data.safePrompt).toBe("去三亚旅行");
    expect(data.storyline_type).toBe("journey");
    expect(data.tone_suggestions.length).toBeGreaterThanOrEqual(1);
    expect(data.focus_options.length).toBeGreaterThanOrEqual(3);
  });

  it("缺 rawPrompt → 400", async () => {
    const res = await POST(mkReq({}));
    expect(res.status).toBe(400);
  });
});
