// translation service：检测非英文输入并翻译为英文，保留语言来源标记。
import { describe, expect, it, vi, beforeEach } from "vitest";

const llmMock = vi.fn();
vi.mock("@/lib/openrouter/chat", () => ({
  createOpenRouterChat: (...args: unknown[]) => llmMock(...args),
}));
vi.mock("@/lib/scene/config", () => ({
  sceneConfig: { textModel: "test-text" },
  hasTextProviderKey: () => true,
}));

import { detectLanguage, translateToEnglish, normalizePromptForPlanning } from "@/lib/scene/services/translation";

describe("detectLanguage", () => {
  it("recognizes plain ASCII English as 'en'", () => {
    expect(detectLanguage("I bought a private helicopter")).toBe("en");
    expect(detectLanguage("Cafe morning routine")).toBe("en");
  });

  it("recognizes simplified or traditional Chinese as 'zh'", () => {
    expect(detectLanguage("买了架直升机")).toBe("zh");
    expect(detectLanguage("週末喝咖啡")).toBe("zh");
  });

  it("recognizes Japanese as 'ja' via hiragana/katakana", () => {
    expect(detectLanguage("ヘリコプターを買った")).toBe("ja");
    expect(detectLanguage("週末はカフェ")).toBe("ja");
  });

  it("recognizes Korean as 'ko'", () => {
    expect(detectLanguage("주말 카페")).toBe("ko");
  });

  it("treats mixed English + CJK as 'zh' when CJK characters are present", () => {
    // 当 prompt 包含中文字符，下游必须走翻译路径才能避免 ScenePlanner 出问题
    expect(detectLanguage("buy a 直升机")).toBe("zh");
  });

  it("treats accented Latin (French/Spanish) as 'en' — LLM 处理无问题", () => {
    expect(detectLanguage("café matin à Paris")).toBe("en");
  });
});

describe("translateToEnglish", () => {
  beforeEach(() => {
    llmMock.mockReset();
  });

  it("calls LLM with translation system prompt and returns the trimmed reply", async () => {
    llmMock.mockResolvedValueOnce("  I bought a helicopter  ");

    const result = await translateToEnglish("买了架直升机");

    expect(result).toBe("I bought a helicopter");
    expect(llmMock).toHaveBeenCalledTimes(1);
    const [messages] = llmMock.mock.calls[0] as [Array<{ role: string; content: string }>];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content.toLowerCase()).toContain("translate");
    expect(messages[1].content).toBe("买了架直升机");
  });

  it("strips wrapping quotes the LLM sometimes adds", async () => {
    llmMock.mockResolvedValueOnce('"I bought a helicopter"');
    expect(await translateToEnglish("买了架直升机")).toBe("I bought a helicopter");
  });

  it("falls back to original text if LLM call fails — never block the user", async () => {
    llmMock.mockRejectedValueOnce(new Error("network"));
    expect(await translateToEnglish("买了架直升机")).toBe("买了架直升机");
  });

  it("falls back to original text if LLM returns empty content", async () => {
    llmMock.mockResolvedValueOnce("");
    expect(await translateToEnglish("买了架直升机")).toBe("买了架直升机");
  });
});

describe("normalizePromptForPlanning", () => {
  beforeEach(() => {
    llmMock.mockReset();
  });

  it("returns the original prompt unchanged for English input — no LLM call", async () => {
    const r = await normalizePromptForPlanning("I bought a helicopter");
    expect(r.workingPrompt).toBe("I bought a helicopter");
    expect(r.originalLanguage).toBe("en");
    expect(r.wasTranslated).toBe(false);
    expect(llmMock).not.toHaveBeenCalled();
  });

  it("translates non-English prompts and flags the result", async () => {
    llmMock.mockResolvedValueOnce("I bought a helicopter");

    const r = await normalizePromptForPlanning("买了架直升机");
    expect(r.workingPrompt).toBe("I bought a helicopter");
    expect(r.originalLanguage).toBe("zh");
    expect(r.wasTranslated).toBe(true);
  });

  it("keeps wasTranslated=false when translation falls back to original", async () => {
    llmMock.mockRejectedValueOnce(new Error("network"));
    const r = await normalizePromptForPlanning("买了架直升机");
    // 翻译失败仍标记为 zh，让上层决定要不要给用户提示
    expect(r.originalLanguage).toBe("zh");
    expect(r.workingPrompt).toBe("买了架直升机");
    expect(r.wasTranslated).toBe(false);
  });
});
