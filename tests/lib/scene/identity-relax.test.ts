import { describe, it, expect } from "vitest";
import { passes } from "@/lib/scene/orchestrator";

const q = (o: Partial<{ same_person: boolean; deformity: boolean; plastic_skin: boolean; quality: number }>) =>
  ({ same_person: false, deformity: false, plastic_skin: false, quality: 0, issues: [], ...o });

describe("passes：质检放宽(identity 误判容错)", () => {
  it("same_person 直接过", () => expect(passes(q({ same_person: true, quality: 3 }), 3)).toBe(true));
  it("same_person=false 但 quality>=4(override)→ 过", () =>
    expect(passes(q({ same_person: false, quality: 4 }), 3)).toBe(true));
  it("same_person=false 且 quality=3(<override)→ 不过", () =>
    expect(passes(q({ same_person: false, quality: 3 }), 3)).toBe(false));
  it("畸形一律不过", () =>
    expect(passes(q({ same_person: true, quality: 5, deformity: true }), 3)).toBe(false));
  it("identityStrict=true 时 same_person=false 即使 quality=5 也不过", () =>
    expect(passes(q({ same_person: false, quality: 5 }), 3, { strict: true })).toBe(false));
});
