import { describe, it, expect, vi, beforeEach } from "vitest";
const chatMock = vi.fn();
vi.mock("@/lib/openrouter/chat", () => ({ createOpenRouterChat: (...a: unknown[]) => chatMock(...a) }));
vi.mock("@/lib/scene/config", () => ({ sceneConfig: { textModel: "t" }, hasTextProviderKey: () => true }));
import { generateStoryline, fallbackStoryline } from "@/lib/scene/services/story-line";
beforeEach(() => chatMock.mockReset());

const input = { safePrompt:"穿越古代当将军", storylineType:"fantasy_role" as const, toneId:"cinematic_drama", focusId:"epic", shotCount:6, companion:null };

describe("generateStoryline returns attire + beats", () => {
  it("解析 attire 与 6 个 beat", async () => {
    chatMock.mockResolvedValueOnce(JSON.stringify({
      attire:{ outfit:"ancient general's lamellar armor and war robe", hairstyle:"long hair under a helmet", accessory:"a sheathed longsword" },
      beats: Array.from({length:6},(_,i)=>({ index:i+1, scene_title:`s${i}`, setting:`place ${i}`, activity:`a${i}`, shot_perspective:"friend_candid", shot_size:i%2?"medium":"wide", wardrobe:"main", expression_beat:`e${i}`, is_highlight:i===3 })),
    }));
    const r = await generateStoryline(input);
    expect(r.attire.outfit).toContain("armor");
    expect(r.beats).toHaveLength(6);
    expect(new Set(r.beats.map(b=>b.setting)).size).toBe(6);
  });
  it("fantasy 类 fallback 的 attire 不是现代装,且全 friend_candid", () => {
    const r = fallbackStoryline(input);
    expect(r.beats.every(b=>b.shot_perspective==="friend_candid")).toBe(true);
    expect(r.attire.outfit.toLowerCase()).not.toContain("sweater");
  });
  it("LLM 失败回退 fallback,仍返回 {attire,beats}", async () => {
    chatMock.mockRejectedValueOnce(new Error("net"));
    const r = await generateStoryline(input);
    expect(r.attire).toBeTruthy();
    expect(r.beats).toHaveLength(6);
  });
});
