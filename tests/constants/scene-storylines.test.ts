import { STORYLINE_TYPES, SCENE_TONES, getStorylineType } from "@/constants/scene-storylines";
import type { StorylineType } from "@/lib/scene/types";

describe("scene storylines & tones", () => {
  it("覆盖全部 8 类故事线类型", () => {
    const keys = STORYLINE_TYPES.map(s => s.id).sort();
    expect(keys).toHaveLength(8);
    (["journey","ownership_flex","fantasy_role","milestone_event","profession","lifestyle","seasonal","transformation"] as StorylineType[])
      .forEach(t => expect(keys).toContain(t));
  });

  it("每类有组织逻辑与专属侧重选项", () => {
    for (const s of STORYLINE_TYPES) {
      expect(s.organizingLogic.length).toBeGreaterThan(0);
      expect(s.focusOptions.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("调性库有 8 个,每个含 promptFragment", () => {
    expect(SCENE_TONES).toHaveLength(8);
    SCENE_TONES.forEach(t => expect(t.promptFragment.length).toBeGreaterThan(0));
  });

  it("getStorylineType 命中关键词,未命中回退 journey", () => {
    expect(getStorylineType("我买了一架私人直升机").id).toBe("ownership_flex");
    expect(getStorylineType("穿越到古代当将军").id).toBe("fantasy_role");
    expect(getStorylineType("毕业典礼那天").id).toBe("milestone_event");
    expect(getStorylineType("随便逛逛").id).toBe("journey"); // 兜底
  });
});
