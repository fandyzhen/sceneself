import { STORYLINE_SYSTEM, storylineInstruction } from "@/lib/scene/prompts";

describe("storyline generation prompt", () => {
  it("system 强调 6 个不同场景 + 手机随手拍", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toContain("different");
    expect(s).toMatch(/phone snapshot|amateur/);
  });

  it("instruction 注入类型组织逻辑 + 调性 + 侧重 + 张数", () => {
    const ins = storylineInstruction({
      safePrompt: "luxury cruise whale watching",
      organizingLogic: "Time arc of one trip",
      continuityLock: "same trip + main outfit",
      toneFragment: "emphasize peak moments",
      focusFragment: "自然奇观",
      shotCount: 6,
      companion: null,
      attireHint: "x",
      era: "modern",
      allowSelfie: true,
      allowModernProps: true,
    });
    expect(ins).toContain("luxury cruise whale watching");
    expect(ins).toContain("Time arc of one trip");
    expect(ins).toContain("emphasize peak moments");
    expect(ins).toContain("6");
  });

  it("有 companion 时注入'第二人不露脸'", () => {
    const ins = storylineInstruction({
      safePrompt: "x",
      organizingLogic: "y",
      continuityLock: "z",
      toneFragment: "t",
      focusFragment: "f",
      shotCount: 6,
      companion: "a friend",
      attireHint: "x",
      era: "modern",
      allowSelfie: true,
      allowModernProps: true,
    });
    expect(ins.toLowerCase()).toContain("second person");
  });
});

describe("storyline instruction — attire & era", () => {
  it("注入 attireHint,要求 LLM 输出 attire", () => {
    const ins = storylineInstruction({
      safePrompt:"穿越古代当将军", organizingLogic:"x", continuityLock:"y",
      toneFragment:"t", focusFragment:"f", shotCount:6, companion:null,
      attireHint:"ancient general's armor", era:"fantasy", allowSelfie:false, allowModernProps:false,
    });
    expect(ins).toContain("ancient general's armor");
    expect(ins.toLowerCase()).toContain("attire");
    expect(ins.toLowerCase()).toMatch(/no selfie|never.*selfie|no modern/);
  });
  it("modern 类不强制禁自拍", () => {
    const ins = storylineInstruction({
      safePrompt:"游轮", organizingLogic:"x", continuityLock:"y", toneFragment:"t", focusFragment:"f",
      shotCount:6, companion:null, attireHint:"modern casual", era:"modern", allowSelfie:true, allowModernProps:true,
    });
    expect(ins).toContain("modern casual");
  });
});

describe("storyline rule 5 放宽：companion 可露脸（用户反馈 - 不构成肖像权）", () => {
  // 用户产品判断：AI 生成虚构人脸不侵犯肖像权；该出现的角色就要出现。
  // 旧 rule 5："NEVER show a second person's face" 过严，导致情感互动场景退化。
  // 新 rule 5：companion 可见但远景/中景，identity 校验仍聚焦主体。

  it("system 允许 companion 出现在画面（远景/中景）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/companion.*(?:may|can|allowed).*(?:visible|appear|present)|second person.*(?:may|can|allowed)|family.*may.*appear|background companion/);
  });

  it("system 不再硬禁 'second person face'，但仍要求 identity 聚焦主体", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    // 不该再有绝对禁令
    expect(s).not.toMatch(/never show a second person'?s face/);
    // 应有"主体优先"指引
    expect(s).toMatch(/main subject|primary subject|subject (?:remains|stays).*foreground|focus.*subject/);
  });

  it("system 仍约束 companion 不喧宾夺主（远景/中景而非特写）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/medium distance|background|smaller in frame|not.*close.?up|subject.*foreground/);
  });
});

describe("storyline 情感/社交 verb 不能被剥离（路径 3）", () => {
  // 用户反馈："为病人做手术，成功后家属感谢" 跑两次都没画家属感谢。
  // 根因：rule 5 禁止 companion 露脸 → LLM 把所有"互动型 climax"退化为环境场景。
  // 修：显式列举 emotional/social verb,要求通过(表情/物品/侧影互动)三种方式之一表达,
  // 禁止用空环境场景(走廊/locker room/出口)悄悄丢掉用户的核心情感叙事。

  it("system 含 emotional/social verb 关键词清单 + 三种允许表达方式", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    // 至少列举出 gratitude/thank/celebrate/hug 中的若干个
    expect(s).toMatch(/gratitude|thank|celebrat|cheer|hug|applaud|embrace|grateful/);
    // 必须提及"通过表情/物品/侧影互动"等具象表达方式中至少一种
    expect(s).toMatch(/facial expression|bouquet|thank-you card|silhouette.*interact|back view.*interact|object.*recogn/);
  });

  it("system 显式禁止把情感 verb 退化为空环境场景", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(do not|never|forbidden).{0,80}(empty|environment|hallway|corridor|locker|exit door|silently drop|replac)/);
  });

  it("system rule 8 强化：必须画 visible payload（物体/表情/角色至少一个）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    // 必须列举具体 payload 类型
    expect(s).toMatch(/(?:held by|in.*hands?|holding).*(?:bouquet|card|gift|certificate|flowers?|letter)/);
    expect(s).toMatch(/(?:facial )?expression|hand over heart|hands clasped|tearful|joyful|head bowed/);
    // 至少必须出现一种 payload 的强制语
    expect(s).toMatch(/must.*(?:include|show|visible|depict).*(?:object|expression|companion|payload)|at least one.*(?:object|expression|companion|payload)/);
  });
});

describe("storyline 含遮挡 outfit 时 bias medium shot（路径 C - wide 主体压缩问题源头）", () => {
  // 用户反馈：恶龙场景 wide 战场主体太小 / 医生 wide 等候区主体太小 → identity fail。
  // wide shot 在含遮挡 outfit 时识别难度大,LLM 应源头减少 wide 比例,
  // 让 wide 仅保留给主体显眼的简单背景场景。

  it("system 含针对遮挡 outfit 的 wide shot 比例约束(≤2/6)", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:helmet|hood|visor|cap|toque|beanie|mask|face[- ]occlud).*(?:at most|no more than|reduce|fewer).*wide|wide.*(?:at most|no more than).*(?:2|two).*(?:of|out of).*6/);
  });

  it("system 鼓励 medium 用于 action-heavy / multi-character 场景", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/medium.*(?:action|multi-character|crowd|combat|fight|busy)|action.*(?:favor|prefer).*medium|crowded.*(?:favor|prefer|use).*medium/);
  });

  it("storylineInstruction 在 wide 比例规则中给遮挡 outfit 例外", () => {
    const ins = storylineInstruction({
      safePrompt:"穿越古代当将军带兵打仗",
      organizingLogic:"x", continuityLock:"y", toneFragment:"t", focusFragment:"f",
      shotCount:6, companion:null, attireHint:"ancient general armor with helmet",
      era:"fantasy", allowSelfie:false, allowModernProps:false,
    });
    const s = ins.toLowerCase();
    // 必须显式说明含遮挡时 wide 比例上限
    expect(s).toMatch(/(?:occlud|helmet|hood|mask|cap|toque|beanie).*(?:at most|no more than|reduce|fewer).*wide|if .*attire.*(?:occlud|helmet|mask).*(?:at most|fewer|reduce)/);
  });
});

describe("storyline rule 10：用户输入的核心实体必须 visible（D1 - 恶龙没出现的根因）", () => {
  // 用户反馈："恶龙没有出现啊"——LLM 把 dragon 退化为 "dragon's lair" 环境暗示。
  // 类比 rule 8 之于 emotional verb，rule 10 强制具体实体出现。

  it("system 含核心实体必须 visible 规则 + 反对环境暗示替代", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:explicitly named|core entit|named (?:noun|character|creature)).*visible|user.*(?:mentioned|named).*(?:entity|creature|character|object).*(?:visible|present|appear)/);
    expect(s).toMatch(/environment.*(?:hint|suggest|imply|substitut)|(?:lair|trace|sign|aftermath).*(?:not|cannot|insufficient).*(?:replac|substitut|stand[- ]in)/);
  });

  it("system 列举常见可能被剥离的实体（dragon / family / patient / soldier / audience）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/dragon|monster|family|patient|soldier|audience|opponent|ghost|alien/);
  });

  it("rule 10 显式 ban 环境暗示词：lair/nest/aftermath/traces/aftermath（E4 强化）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:forbidden|never|no|not).*(?:lair|nest|traces?|aftermath|sign[s]? of|smoke from|empty .*scene)/);
  });

  it("rule 10 强制至少 1 帧实体全身/头部 visible（不只是 hint）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/at least one beat.*(?:fully|whole|entire|head|body).*visible|the (?:dragon|monster|family|patient|opponent).*(?:must|shall) (?:appear|be visible).*(?:fully|whole|head|body|in frame)/);
  });
});

describe("storyline rule 14：命名 IP 角色不能泛化（F1 - 变身超人→ 蝙蝠侠 cowl 错误）", () => {
  // 用户反馈：「变身超人」LLM 翻译为 generic superhero,自由发挥设计了 cowl + 蓝衣。
  // 直接输入 Superman 命中正确。修：rule 14 强制命名角色保留 canonical look。

  it("system 含命名 IP 角色识别规则（superhero/anime/historical figure）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/named character|specific character|canonical|signature look|iconic outfit|ip character/);
  });

  it("system 显式给出 Superman/Batman 等典型例子", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/superman.*(?:red cape|s.?emblem|blue.*spandex|red boots)/);
    expect(s).toMatch(/batman.*(?:cowl|black cape|bat.?emblem|pointed ears)/);
  });

  it("system 禁止把命名角色泛化为 generic / category", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:do not|never|forbidden|must not).*(?:generic|generaliz|category).*(?:superhero|samurai|princess|character)/);
  });

  it("system 处理中文/其它语言 IP 名（中文'超人'识别为 Superman）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:non-english|chinese|chinese name|translit|across language).*(?:character|ip|name|iconic)|(?:超人|蝙蝠侠|钢铁侠)/);
  });
});

describe("storyline rule 12：领域常识胜过 identity 容易过（E2）", () => {
  // 用户反馈：医生 mask 戴脖子上 + 戴手表 = 违背 OR 无菌常识。
  // LLM 为规避 identity 难度规避真实场景。rule 12 强制领域常识。

  it("system 含手术/OR 场景常识约束（mask on face + no watch/jewelry）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:surgery|surgical|operating room|or|scrub).*(?:mask.*(?:on|covering|over).*(?:face|nose|mouth)|mask.*must.*(?:worn|cover))/);
    expect(s).toMatch(/(?:surgery|surgical|operating room|or|scrub).*(?:no watch|no jewelry|no ring|no wristwatch|sterile)|(?:sterile|infection).*(?:no .*(?:watch|jewelry|ring))/);
  });

  it("system 含其他高风险/高常识场景（潜水/宇航/消防/厨房）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:divin|underwater).*mask|spacewalk|astronaut.*(?:helmet|suit)|firefighter.*(?:mask|gear)|kitchen.*(?:toque|apron)/);
  });

  it("system 显式说明真实感胜过 identity 容易过", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:real(?:ism|istic)|context|common[- ]sense|professional).*(?:over|than|before|preferred).*identity|(?:do not|never|forbidden).*(?:relax|loosen|skip).*(?:realism|safety|sterile|professional)/);
  });
});

describe("storyline rule 11：face_orientation 角度比例（D2）", () => {
  // 用户反馈："大部分能看到脸，1-2 帧背面/侧面（叙事合理时），不能为规避识别凑数"。

  it("system 含 face_orientation 比例约束：≥4 front/three_quarter, ≤2 profile/back", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:at least|≥|>=) ?(?:4|four).*(?:front|three[- ]?quarter)/);
    expect(s).toMatch(/(?:at most|no more than|≤|<=) ?(?:2|two).*(?:profile|back[- ]?view|back view|side view)/);
  });

  it("system 要求背/侧面有叙事合理性（不能为规避识别凑数）", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toMatch(/(?:back|profile|side).*(?:must|require|only when).*(?:narrative|scene|story|plot|action|moment)|never.*(?:avoid|evade|escape).*(?:identity|recognition)/);
  });
});
