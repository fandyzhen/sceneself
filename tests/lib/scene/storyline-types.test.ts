import type { StoryBeat, StorylineType, SceneTone } from "@/lib/scene/types";

describe("storyline domain types", () => {
  it("StoryBeat 接受一个完整的 beat", () => {
    const beat: StoryBeat = {
      index: 1,
      scene_title: "登船震撼",
      setting: "游轮舷梯口,回望整艘船",
      activity: "拖着行李回头仰望游轮",
      shot_perspective: "friend_candid",
      shot_size: "wide",
      wardrobe: "main",
      expression_beat: "仰头惊叹,嘴角上扬",
      is_highlight: false,
    };
    expect(beat.shot_perspective).toBe("friend_candid");
  });

  it("StorylineType 是 8 类之一", () => {
    const t: StorylineType = "ownership_flex";
    expect(t).toBe("ownership_flex");
  });

  it("SceneTone 含 id 与 prompt 片段", () => {
    const tone: SceneTone = { id: "surprise_highlight", label: "惊喜高光", emoji: "✨", promptFragment: "emphasize unexpected delightful moments" };
    expect(tone.id).toBe("surprise_highlight");
  });
});
