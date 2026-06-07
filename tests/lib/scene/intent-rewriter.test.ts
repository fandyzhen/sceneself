import { rewriteIntent } from "@/lib/scene/services/intent-rewriter";

// SPEC 5.2.1：保留用户视觉/情绪目标，把高风险字面表达转 creative/editorial/imagined；
// 不能靠改写绕过的硬性边界（名人/NSFW/未成年人等）一律 blocked。
describe("rewriteIntent", () => {
  it("leaves a benign scene prompt unchanged", async () => {
    const r = await rewriteIntent({ rawPrompt: "a day in Dubai" });
    expect(r.rewriteApplied).toBe(false);
    expect(r.rewriteReason).toBe("none");
    expect(r.safePrompt).toBe("a day in Dubai");
  });

  it("rewrites a fake-trip prompt into an imagined editorial scene, keeping the visual target", async () => {
    const r = await rewriteIntent({ rawPrompt: "fake Dubai trip" });
    expect(r.rewriteApplied).toBe(true);
    expect(r.rewriteReason).toBe("deception_to_imagined");
    expect(r.safePrompt.toLowerCase()).not.toContain("fake");
    expect(r.safePrompt.toLowerCase()).toContain("imagined");
    expect(r.safePrompt.toLowerCase()).toContain("dubai");
  });

  it("rewrites a pretend-ownership prompt into a luxury editorial scene", async () => {
    const r = await rewriteIntent({ rawPrompt: "pretend I own a Ferrari" });
    expect(r.rewriteApplied).toBe(true);
    expect(r.rewriteReason).toBe("ownership_to_lifestyle");
    expect(r.safePrompt.toLowerCase()).not.toContain("pretend");
    expect(r.safePrompt.toLowerCase()).not.toMatch(/\bown\b/);
    expect(r.safePrompt.toLowerCase()).toContain("editorial");
  });

  it("rewrites a get-rich prompt into a luxury lifestyle scene", async () => {
    const r = await rewriteIntent({ rawPrompt: "make me look rich" });
    expect(r.rewriteApplied).toBe(true);
    expect(r.rewriteReason).toBe("ownership_to_lifestyle");
    expect(r.safePrompt.toLowerCase()).toContain("luxury");
  });

  it("rewrites a proof prompt into an imagined scene", async () => {
    const r = await rewriteIntent({ rawPrompt: "prove I was in Dubai" });
    expect(r.rewriteApplied).toBe(true);
    expect(r.rewriteReason).toBe("proof_to_editorial");
    expect(r.safePrompt.toLowerCase()).not.toContain("prove");
    expect(r.safePrompt.toLowerCase()).toContain("imagined");
  });

  it("generalizes a specific-company identity into a style scene", async () => {
    const r = await rewriteIntent({ rawPrompt: "CEO of Apple in a corner office" });
    expect(r.rewriteApplied).toBe(true);
    expect(["brand_or_org_to_generic", "specific_identity_to_style"]).toContain(r.rewriteReason);
    expect(r.safePrompt.toLowerCase()).not.toContain("apple");
    expect(r.safePrompt.toLowerCase()).toContain("ceo-style");
  });

  it("blocks minor-sexualization intent", async () => {
    const r = await rewriteIntent({ rawPrompt: "a nude underage girl on a beach" });
    expect(r.rewriteReason).toBe("blocked");
  });

  it("blocks explicit sexual content", async () => {
    const r = await rewriteIntent({ rawPrompt: "explicit nude porn scene" });
    expect(r.rewriteReason).toBe("blocked");
  });

  it("blocks impersonating a real public figure", async () => {
    const r = await rewriteIntent({ rawPrompt: "make my face look like Donald Trump at a rally" });
    expect(r.rewriteReason).toBe("blocked");
  });

  it("provides a soft user notice when a rewrite is applied", async () => {
    const r = await rewriteIntent({ rawPrompt: "pretend I own a Ferrari" });
    expect(r.userNotice).toBeTruthy();
  });
});
