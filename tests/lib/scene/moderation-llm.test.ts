import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/scene/config", () => ({
  sceneConfig: { moderationProvider: "llm", textModel: "t" },
  hasTextProviderKey: () => true,
}));
const chatMock = vi.fn();
vi.mock("@/lib/openrouter/chat", () => ({ createOpenRouterChat: (...a: unknown[]) => chatMock(...a) }));
import { screenPrompt, isBlocked } from "@/lib/scene/services/prompt-moderation";

describe("llmScreen 内容审核(中英文)", () => {
  beforeEach(() => chatMock.mockReset());
  it("特朗普 → impersonation deny", async () => {
    chatMock.mockResolvedValue('{"decision":"deny","reason":"impersonation"}');
    expect(isBlocked(await screenPrompt({ safePrompt: "dinner with President Trump" }))).toBe(true);
  });
  it("中文色情 → adult deny(不再中文全盲)", async () => {
    chatMock.mockResolvedValue('{"decision":"deny","reason":"adult"}');
    expect(isBlocked(await screenPrompt({ safePrompt: "裸体晚宴" }))).toBe(true);
  });
  it("正常 → allow", async () => {
    chatMock.mockResolvedValue('{"decision":"allow"}');
    expect(isBlocked(await screenPrompt({ safePrompt: "a day in Dubai" }))).toBe(false);
  });
  it("LLM 返回无 JSON 纯文字 → fail closed deny(不误放行)", async () => {
    chatMock.mockResolvedValue("I cannot help with this request.");
    expect(isBlocked(await screenPrompt({ safePrompt: "something edgy" }))).toBe(true);
  });
  it("LLM 返回非法 JSON → catch fail closed deny", async () => {
    chatMock.mockResolvedValue("{bad json here}"); // 有括号但 JSON.parse 抛错 → catch → fail closed
    expect(isBlocked(await screenPrompt({ safePrompt: "something" }))).toBe(true);
  });
});
