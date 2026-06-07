import { screenPrompt } from "@/lib/scene/services/prompt-moderation";

// SPEC 5.2.2：对 safe_prompt 做进入出图流程前的最终把关。
// MVP = LocalRuleModerationProvider；flag/deny/失败都按 block 处理（fail closed）。
describe("screenPrompt (local provider)", () => {
  it("allows a clean imagined scene prompt", async () => {
    const r = await screenPrompt({ safePrompt: "imagined Dubai travel photo set, warm daylight" });
    expect(r.decision).toBe("allow");
  });

  it("denies sexual content", async () => {
    const r = await screenPrompt({ safePrompt: "nude explicit scene" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("adult");
    expect(r.userMessage).toBeTruthy();
  });

  it("denies minor-safety content with priority over other flags", async () => {
    const r = await screenPrompt({ safePrompt: "a child at the beach" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("minor_safety");
  });

  it("denies violent content", async () => {
    const r = await screenPrompt({ safePrompt: "a bloody massacre on the street" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("violence");
  });

  it("denies impersonation of a public figure", async () => {
    const r = await screenPrompt({ safePrompt: "a portrait that looks like Elon Musk" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("impersonation");
  });

  it("denies proof / ownership-claim framing", async () => {
    const r = await screenPrompt({ safePrompt: "proof that I really own this mansion" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("deception_or_proof");
  });

  it("judges the safe prompt, not the raw prompt — a rewrite must not be overridden", async () => {
    // IntentRewriter 已把 "pretend I own a Ferrari" 改写成安全口径；
    // moderation 审改写后的 safePrompt，不能因 rawPrompt 含 "I own" 又拦下。
    const r = await screenPrompt({
      safePrompt: "luxury Ferrari editorial scene set",
      rawPrompt: "pretend I own a Ferrari",
    });
    expect(r.decision).toBe("allow");
  });
});
