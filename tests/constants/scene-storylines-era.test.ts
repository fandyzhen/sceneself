import { STORYLINE_TYPES } from "@/constants/scene-storylines";

describe("storyline era constraints", () => {
  it("幻想角色 = fantasy/historical,禁自拍禁现代道具", () => {
    const f = STORYLINE_TYPES.find(s => s.id === "fantasy_role")!;
    expect(["historical","fantasy","future"]).toContain(f.era);
    expect(f.allowSelfie).toBe(false);
    expect(f.allowModernProps).toBe(false);
  });
  it("旅程/拥有 = modern,允许自拍+现代道具", () => {
    for (const id of ["journey","ownership_flex"]) {
      const s = STORYLINE_TYPES.find(x => x.id === id)!;
      expect(s.era).toBe("modern");
      expect(s.allowSelfie).toBe(true);
      expect(s.allowModernProps).toBe(true);
    }
  });
  it("职业/事件:禁现代包(allowModernProps=false),仍允许自拍", () => {
    const p = STORYLINE_TYPES.find(s => s.id === "profession")!;
    expect(p.allowModernProps).toBe(false);
    expect(p.allowSelfie).toBe(true);
  });
  it("每类都有 attireHint(英文造型指引)", () => {
    for (const s of STORYLINE_TYPES) expect(s.attireHint.length).toBeGreaterThan(0);
  });
});
