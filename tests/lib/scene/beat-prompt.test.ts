import { buildFramePromptFromBeat } from "@/lib/scene/scene-plan";
import type { StoryBeat, SceneContinuity } from "@/lib/scene/types";
const cont: SceneContinuity = { outfit:"x", accessory:"y", hairstyle:"h", jewelry:"j", shoes:"s", camera_style:"c", film_look:"f" };
const base: StoryBeat = { index:1, scene_title:"t", setting:"a castle gate", activity:"pushing the gate", shot_perspective:"selfie", shot_size:"medium", wardrobe:"main", expression_beat:"calm", is_highlight:false };

describe("buildFramePromptFromBeat v2 (视角/era/解剖)", () => {
  it("场景用 beat 的 setting+activity", () => {
    const p = buildFramePromptFromBeat("x", base, cont);
    expect(p).toContain("a castle gate");
    expect(p).toContain("pushing the gate");
  });
  it("selfie = 前置视角,明确看不到拿手机的手/无伸出手臂", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/do not see the hand|no arm reaching|front-camera/);
  });
  it("friend_candid 不拿手机", () => {
    const p = buildFramePromptFromBeat("x", { ...base, shot_perspective:"friend_candid" }, cont).toLowerCase();
    expect(p).toMatch(/not holding a phone|no phone/);
  });
  it("换装时用新造型而非主 outfit", () => {
    const p = buildFramePromptFromBeat("x", { ...base, wardrobe:"change:black evening gown" }, cont);
    expect(p).toContain("black evening gown");
  });
  it("era=fantasy 注入禁现代道具/手机/运动鞋", () => {
    const p = buildFramePromptFromBeat("x", base, cont, { era:"fantasy", allowSelfie:false, allowModernProps:false }).toLowerCase();
    expect(p).toMatch(/no modern|no phone|period-accurate/);
  });
  it("全局 negative:恰两只手", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/exactly two hands|no third|no extra (arm|hand|limb)/);
  });
  it("锁主造型 + 手机随手拍底色", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toContain("same person as the reference selfie");
    expect(p).toMatch(/deep focus|no bokeh|phone/);
  });
});

describe("buildFramePromptFromBeat: 遮挡 outfit (helmet/hood/visor) 救脸", () => {
  const occOutfit = "polished silver iron-banded helmet, black armor, crimson silk war robe";
  const hoodOutfit = "navy parka with deep fur-trimmed hood, grey wool scarf, brown boots";
  const plainOutfit = "charcoal grey wool overcoat, cream cashmere scarf, dark blue denim jeans, black leather chelsea boots";
  const cOcc: SceneContinuity = { ...cont, outfit: occOutfit };
  const cHood: SceneContinuity = { ...cont, outfit: hoodOutfit };
  const cPlain: SceneContinuity = { ...cont, outfit: plainOutfit };

  it("含 helmet → 注入 face fully visible 指令", () => {
    const p = buildFramePromptFromBeat("x", base, cOcc).toLowerCase();
    expect(p).toMatch(/identity cues|exposed skin|body proportions|posture/);
    // 撤回：不该强迫脸完全露出（医生戴 mask / 蝙蝠侠戴面具是合理的）
    expect(p).not.toMatch(/face must be fully visible|(?:must|should) (?:remove|push back|pull down)/);
    expect(p).toMatch(/stays naturally worn|naturally worn|do not remove|do not.*push back|do not.*pull down/);
  });

  it("含 hood → 同样注入露脸指令", () => {
    const p = buildFramePromptFromBeat("x", base, cHood).toLowerCase();
    expect(p).toMatch(/identity cues|exposed skin|body proportions|posture/);
    // 撤回：不该强迫脸完全露出（医生戴 mask / 蝙蝠侠戴面具是合理的）
    expect(p).not.toMatch(/face must be fully visible|(?:must|should) (?:remove|push back|pull down)/);
    expect(p).toMatch(/stays naturally worn|naturally worn|do not remove|do not.*push back|do not.*pull down/);
  });

  it("普通 outfit → 不出现救脸指令（保持原 prompt）", () => {
    const p = buildFramePromptFromBeat("x", base, cPlain).toLowerCase();
    expect(p).not.toMatch(/face must be fully visible|no shadow.*(brim|helmet|hood)/);
  });

  it("遮挡 + wide shot → face 比例 >= 25%（与 occluded medium 持平，解多人 wide 主体压缩）", () => {
    const p = buildFramePromptFromBeat("x", { ...base, shot_size: "wide" }, cOcc).toLowerCase();
    expect(p).not.toContain("face less than 8% of frame");
    expect(p).toMatch(/face .*at least (2[5-9]|3\d)%|face fills .*(2[5-9]|3\d)%/);
    // 同时强调 main subject prominent
    expect(p).toMatch(/main subject.*(?:closest|largest|prominent|foreground)|subject.*closest to camera|largest (?:person )?in frame/);
  });

  it("遮挡 + medium shot → face 比例下限提高（不再是 <18%）", () => {
    const p = buildFramePromptFromBeat("x", { ...base, shot_size: "medium" }, cOcc).toLowerCase();
    expect(p).not.toContain("face less than 18% of frame");
    expect(p).toMatch(/face .*at least (2[5-9]|3\d)%|face fills .*(2[5-9]|3\d)%/);
  });

  it("普通 outfit + wide shot → 仍是原 <8% 描述", () => {
    const p = buildFramePromptFromBeat("x", { ...base, shot_size: "wide" }, cPlain);
    expect(p).toContain("face less than 8% of frame");
  });

  it("普通 outfit + medium shot → 仍是原 <18% 描述", () => {
    const p = buildFramePromptFromBeat("x", { ...base, shot_size: "medium" }, cPlain);
    expect(p).toContain("face less than 18% of frame");
  });

  it("含 ski mask/balaclava → 同样触发救脸", () => {
    const masked: SceneContinuity = { ...cont, outfit: "black tactical jacket, ski mask covering nose and mouth, dark cargo pants" };
    const p = buildFramePromptFromBeat("x", base, masked).toLowerCase();
    expect(p).toMatch(/face .*at least \d+%|identity cues|exposed skin|body proportions/);
  });

  it("含 scrub cap（医生场景）→ 触发救脸", () => {
    const doc: SceneContinuity = { ...cont, outfit: "light blue surgical scrub cap, light blue scrub top, light blue scrub trousers, white nursing clogs" };
    const p = buildFramePromptFromBeat("x", base, doc).toLowerCase();
    expect(p).toMatch(/face .*at least \d+%|identity cues|exposed skin|body proportions/);
  });

  it("含 chef toque（厨师场景）→ 触发救脸", () => {
    const chef: SceneContinuity = { ...cont, outfit: "white chef's toque, white double-breasted chef coat, blue houndstooth pants, black non-slip clogs" };
    const p = buildFramePromptFromBeat("x", base, chef).toLowerCase();
    expect(p).toMatch(/face .*at least \d+%|identity cues|exposed skin|body proportions/);
  });

  it("含 baseball cap → 触发救脸（帽檐遮眉/眼阴影）", () => {
    const cap: SceneContinuity = { ...cont, outfit: "navy baseball cap, white cotton tee, dark jeans, white sneakers" };
    const p = buildFramePromptFromBeat("x", base, cap).toLowerCase();
    expect(p).toMatch(/face .*at least \d+%|identity cues|exposed skin|body proportions/);
  });

  it("含 beanie → 触发救脸", () => {
    const beanie: SceneContinuity = { ...cont, outfit: "grey wool beanie, oversized hoodie, black joggers, white sneakers" };
    const p = buildFramePromptFromBeat("x", base, beanie).toLowerCase();
    expect(p).toMatch(/face .*at least \d+%|identity cues|exposed skin|body proportions/);
  });

  it("含 surgical mask（在脸上时）→ 触发救脸", () => {
    const mask: SceneContinuity = { ...cont, outfit: "blue scrub top, blue scrub trousers, surgical mask over nose and mouth, white clogs" };
    const p = buildFramePromptFromBeat("x", base, mask).toLowerCase();
    expect(p).toMatch(/face .*at least \d+%|identity cues|exposed skin|body proportions/);
  });

  it("outfit 含 'cape'（披风，不是帽子）→ 不误中", () => {
    const cape: SceneContinuity = { ...cont, outfit: "polished silver armor, flowing red velvet cape, black leather boots" };
    const p = buildFramePromptFromBeat("x", { ...base, shot_size: "wide" }, cape);
    expect(p).toContain("face less than 8% of frame");
  });
});

describe("buildFramePromptFromBeat: companion 段放宽（用户反馈）", () => {
  // 旧 companion 段："NEVER show the second person's face" 过严。
  // 新版：允许露脸但 medium distance/background，主体仍 foreground。

  it("含 companion → 允许 visible face（远景/中景）", () => {
    const beat = { ...base, companion: "grateful patient's family — mother and son" };
    const p = buildFramePromptFromBeat("x", beat, cont).toLowerCase();
    expect(p).toMatch(/medium distance|background|smaller in frame|main subject.*foreground|subject (?:remains|stays).*foreground/);
  });

  it("含 companion → 不再硬禁 second person face", () => {
    const beat = { ...base, companion: "patient's family" };
    const p = buildFramePromptFromBeat("x", beat, cont).toLowerCase();
    expect(p).not.toMatch(/never show.*second person'?s face|second person.*never.*face/);
  });

  it("含 companion → 仍保留 silhouette/back view/blurred 作为可选表达", () => {
    const beat = { ...base, companion: "a friend holding hands" };
    const p = buildFramePromptFromBeat("x", beat, cont).toLowerCase();
    expect(p).toMatch(/silhouette|back view|blurred|held hand/);
  });

  it("无 companion → 不出现 companion 段", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).not.toMatch(/companion|second person|family member/);
  });
});

describe("buildFramePromptFromBeat: face_orientation 注入 image_prompt（D4）", () => {
  // 用户产品判断:大部分正面，1-2 帧背面/侧面叙事合理时使用。
  // StoryBeat 含 face_orientation → image_prompt 显式告诉图模型这帧的角度。

  it("face_orientation='front' → 注入'directly facing camera'", () => {
    const p = buildFramePromptFromBeat("x", { ...base, face_orientation: "front" }, cont).toLowerCase();
    expect(p).toMatch(/face (?:directly )?(?:facing|toward) (?:the )?camera|front[- ]?facing|face the camera/);
  });

  it("face_orientation='three_quarter' → 注入'three-quarter'", () => {
    const p = buildFramePromptFromBeat("x", { ...base, face_orientation: "three_quarter" }, cont).toLowerCase();
    expect(p).toMatch(/three[- ]?quarter|3\/4 (?:angle|view)|slightly turned/);
  });

  it("face_orientation='profile' → 注入'side profile'", () => {
    const p = buildFramePromptFromBeat("x", { ...base, face_orientation: "profile" }, cont).toLowerCase();
    expect(p).toMatch(/side profile|profile view|seen from the side/);
  });

  it("face_orientation='back_view' → 注入背面 + 强调 outfit/发型/体型识别", () => {
    const p = buildFramePromptFromBeat("x", { ...base, face_orientation: "back_view" }, cont).toLowerCase();
    expect(p).toMatch(/back view|from behind|facing away/);
    // 同时强调 identity 走 outfit/发型/体型
    expect(p).toMatch(/outfit.*hair.*body|hair.*outfit.*body|body.*hair.*outfit|identity.*(?:outfit|hair|body)|(?:back|behind).*identifiabl/);
  });

  it("无 face_orientation → 不注入（不破坏现有 prompt）", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).not.toMatch(/face (?:directly )?facing the camera|back view|side profile|three[- ]?quarter/);
  });
});

describe("buildFramePromptFromBeat: 战斗/动作姿势反夸张（防 realism fail）", () => {
  // 用户反馈：恶龙场景 #4 "delivering decisive blow to dragon" 触发 realism (deformity)。
  // 极端战斗/动作 prompt 让图模型生成扭曲肢体 / 不可能的握武器姿势 → vlm 判畸形。

  it("任何 outfit → 含反夸张动作指令（防极端姿势触发畸形）", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/no exaggerated.*pose|no broken limb|no impossible.*(?:weapon|pose|stance)|no extreme.*(?:contort|bend|stretch)/);
  });
});

describe("buildFramePromptFromBeat: attire 锁定强化（防莫名加眼镜 - E3）", () => {
  // 用户反馈：一张莫名带眼镜了。LLM/图模型在 prompt 长时偶尔自由加 accessories。
  // 加显式 strict ban 列表，特别针对眼镜/帽子/首饰 等高频自由发挥项。

  it("显式 ban 未列出的 eyewear/glasses/sunglasses", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/no (?:eyewear|glasses|sunglasses|goggles|reading glasses).*(?:unless|except).*(?:listed|outfit)|strict.*no.*(?:glasses|eyewear)/);
  });

  it("显式 ban 未列出的 hat/headwear（已 outfit 列了的不算）", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/no (?:hat|headwear|cap).*(?:unless|except).*(?:listed|outfit)|strict.*no.*(?:hat|headwear)/);
  });

  it("显式 ban 未列出的 accessories（笼统兜底）", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/no (?:additional|extra|unlisted).*accessor|strict.*no.*accessor/);
  });

  it("outfit 列了 glasses → 不该被 ban（正例反向）", () => {
    const withGlasses: SceneContinuity = { ...cont, outfit: "round wire-frame glasses, charcoal grey wool blazer, black cotton tee, dark jeans, brown leather loafers" };
    const p = buildFramePromptFromBeat("x", base, withGlasses).toLowerCase();
    // outfit 段含 glasses 字样
    expect(p).toContain("glasses");
  });
});
