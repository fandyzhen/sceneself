# 故事线引擎(后端)实现计划 — Plan A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用"故事线分解"取代硬编码叙事弧,让一组 6 张照片成为**不同场景的故事**(而非同一场景多角度),并按内容类型(8 类)采用不同的组织逻辑。

**Architecture:** 两段式 LLM。第零步分类(8 类故事线类型 + 调性预选);第一步生成故事线(6 个互不相同的 `StoryBeat`);第二步把每个 beat 展开成每帧 `image_prompt`。取代 `scene-plan.ts` 里的 `VEHICLE_ARC`/`OBJECT_ARC`/`GENERIC_ARC`/`narrativeBeats`。前端问答 UI 是独立的 Plan B。

**Tech Stack:** TypeScript / Next.js / OpenRouter(Gemini 3.1 Flash Lite,经 `lib/openrouter/chat.ts` 的 `createOpenRouterChat`)/ Vitest。

> ⚠️ **本项目不是 git 仓库**,所以每个 Task 末尾的"提交"步骤改为**运行相关测试 + `pnpm lint` 验证**。不要执行 `git` 命令。

---

## 设计参考

完整决策见 spec:`docs/superpowers/specs/2026-06-04-storyline-scene-generation-design.md`。关键点:
- 故事线 = 6 个不同场景;"靠什么串"取决于 8 类故事线类型(旅程/拥有炫耀/幻想角色/高光事件/职业身份/生活美学/节日季节/蜕变成长)。
- 主造型贯穿 + 1-2 关键场景换装;拍摄视角 AI 自动(自拍/朋友拍);陪伴是正交修饰(第二人不露正脸)。
- 统一"普通手机随手拍"质感(deep focus、无 bokeh、真实皮肤)。

## File Structure

| 文件 | 动作 | 责任 |
|---|---|---|
| `lib/scene/types.ts` | modify | 新增 `StoryBeat`/`StorylineType`/`SceneTone`;`ShotSpec` 加 `shot_perspective`/`wardrobe`/`companion` |
| `constants/scene-storylines.ts` | create | 8 类故事线类型库 + 8 个调性库(纯数据) |
| `lib/scene/prompts.ts` | modify | 新增故事线生成 system + builder;砍掉旧风格/叙事弧指令 |
| `lib/scene/services/story-line.ts` | create | 故事线生成服务(分类→6 StoryBeat,LLM + fallback) |
| `lib/scene/scene-plan.ts` | modify | 移除 `*_ARC`/`narrativeBeats`/`fitArc`;新增 `buildFramePromptFromBeat` |
| `lib/scene/services/scene-planner.ts` | modify | `classifyScene` 输出 `storyline_type` + 调性预选;`buildScenePlan` 接两段式 |
| `lib/scene/services/index.ts` | modify | 导出 `generateStoryline` |
| 测试 | create/modify | 见各 Task |

---

## Phase 1 — 类型与常量

### Task 1: 新增故事线领域类型

**Files:**
- Modify: `lib/scene/types.ts`(在 `ShotSpec` 后追加)
- Test: `tests/lib/scene/storyline-types.test.ts`

- [ ] **Step 1: 写失败测试**(类型层用"结构存在性"测,验证常量符合类型)

```ts
// tests/lib/scene/storyline-types.test.ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/storyline-types.test.ts`
Expected: FAIL(类型未定义,TS 编译/导入报错)

- [ ] **Step 3: 在 `lib/scene/types.ts` 追加类型**

在 `ShotSpec` 定义后追加:

```ts
// ── 故事线领域类型(v2:故事线分解机制)──────────────

// 8 类故事线原型(决定"6 个场景靠什么串联")
export type StorylineType =
  | 'journey'          // 旅程体验:时间线
  | 'ownership_flex'   // 拥有炫耀:物体环绕
  | 'fantasy_role'     // 幻想角色:名场面集锦
  | 'milestone_event'  // 高光事件:事件弧
  | 'profession'       // 职业身份:身份切面
  | 'lifestyle'        // 生活美学:主题变奏
  | 'seasonal'         // 节日季节:氛围铺陈
  | 'transformation';  // 蜕变成长:对比弧

// 拍摄视角(AI 按场景自动分配)
export type ShotPerspective = 'selfie' | 'friend_candid';

// 故事线的一个节拍 = 一个独立场景
export interface StoryBeat {
  index: number;
  scene_title: string;                 // 简短场景名,如"鲸鱼浮出喷水的瞬间"
  setting: string;                     // 具体地点/环境(每帧必须不同)
  activity: string;                    // 在干什么
  shot_perspective: ShotPerspective;   // selfie | friend_candid
  shot_size: ShotSize;                 // wide | medium(不用 close)
  wardrobe: 'main' | string;           // 'main' 或 "change:晚礼服"
  expression_beat: string;             // 本帧微表情
  is_highlight?: boolean;              // 高潮/惊喜帧
  companion?: string;                  // 陪伴修饰(第二人不露正脸),如 "背影同框的朋友";无则省略
}

// 调性(问答 Q1 用)
export interface SceneTone {
  id: string;
  label: string;          // 中文展示名
  emoji: string;
  promptFragment: string; // 注入故事线生成的英文调性指令
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/lib/scene/storyline-types.test.ts`
Expected: PASS

- [ ] **Step 5: 验证**

Run: `pnpm lint`
Expected: 无报错

---

### Task 2: 故事线类型库 + 调性库常量

**Files:**
- Create: `constants/scene-storylines.ts`
- Test: `tests/constants/scene-storylines.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/constants/scene-storylines.test.ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/constants/scene-storylines.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 创建 `constants/scene-storylines.ts`**

```ts
import type { StorylineType, SceneTone } from "@/lib/scene/types";

export interface StorylineTypeDef {
  id: StorylineType;
  label: string;                 // 中文
  organizingLogic: string;       // 英文:6 个场景如何组织(注入故事线生成 prompt)
  continuityLock: string;        // 英文:连贯靠什么(注入 prompt)
  focusOptions: { id: string; label: string }[]; // Q2 侧重专属选项
  toneBias: string[];            // 该类默认高亮的调性 id
  // 关键词(中英),用于 fallback 分类
  test: RegExp;
}

export const STORYLINE_TYPES: StorylineTypeDef[] = [
  {
    id: "ownership_flex",
    label: "拥有炫耀",
    organizingLogic: "Orbit one owned hero object: each photo a different scene/use of it, every shot makes it unmistakably the subject's own.",
    continuityLock: "the exact same object (lock its color/model/markings) + main outfit",
    focusOptions: [ {id:"luxury",label:"极致豪华"},{id:"lifestyle",label:"上流生活方式"},{id:"social",label:"社交名利场"},{id:"detail",label:"质感细节"} ],
    toneBias: ["versailles_flex","cinematic_drama"],
    test: /买|购入|拥有|我的|私人(飞机|游艇|直升机)|豪车|跑车|名表|劳力士|法拉利|兰博基尼|保时捷|游艇|直升机|mansion|bought|i own|ferrari|lamborghini|porsche|yacht|rolex|helicopter|private jet/i,
  },
  {
    id: "fantasy_role",
    label: "幻想角色",
    organizingLogic: "Greatest-hits of one fantasy identity: different iconic moments of that character/world, NOT a time arc.",
    continuityLock: "the same costume + the same world/era aesthetic",
    focusOptions: [ {id:"world",label:"世界观沉浸"},{id:"charisma",label:"角色魅力"},{id:"epic",label:"史诗大场面"},{id:"aesthetic",label:"唯美意境"} ],
    toneBias: ["cinematic_drama","epic_blood"],
    test: /穿越|古代|未来|超人|英雄|超级英雄|动漫|武侠|仙侠|赛博朋克|魔法|变身|cosplay|超能力|superhero|fantasy|time travel|cyberpunk|anime|warrior/i,
  },
  {
    id: "milestone_event",
    label: "高光事件",
    organizingLogic: "Event arc across one occasion: prep -> the peak moment -> celebration, different stages.",
    continuityLock: "the same event setting + main outfit",
    focusOptions: [ {id:"peak",label:"高光时刻"},{id:"prep",label:"幕后准备"},{id:"celebrate",label:"欢庆"},{id:"emotion",label:"情感"} ],
    toneBias: ["narrative_doc","surprise_highlight"],
    test: /毕业|婚礼|生日|升职|开业|获奖|典礼|周年|纪念日|graduation|wedding|birthday|anniversary|ceremony|award|launch/i,
  },
  {
    id: "profession",
    label: "职业身份",
    organizingLogic: "Identity facets of one role: at work / focused / candid break / signature moment, different sides.",
    continuityLock: "the same professional attire + workplace",
    focusOptions: [ {id:"authority",label:"专业权威"},{id:"warm",label:"亲和温度"},{id:"backstage",label:"幕后真实"},{id:"peak",label:"高光时刻"} ],
    toneBias: ["narrative_doc","cinematic_drama"],
    test: /ceo|总裁|创始人|医生|律师|飞行员|机长|厨师|主厨|艺术家|设计师|程序员|教师|executive|founder|doctor|lawyer|pilot|chef|artist/i,
  },
  {
    id: "transformation",
    label: "蜕变成长",
    organizingLogic: "Contrast arc: from one state toward another, showing the change across the set.",
    continuityLock: "the same person identity; the transformation theme",
    focusOptions: [ {id:"before_after",label:"前后对比"},{id:"process",label:"过程记录"},{id:"result",label:"成果绽放"} ],
    toneBias: ["epic_blood","narrative_doc"],
    test: /减肥|增肌|健身蜕变|变装|改造|蜕变|逆袭|transformation|glow up|makeover|weight loss/i,
  },
  {
    id: "seasonal",
    label: "节日季节",
    organizingLogic: "Atmosphere spread of one festival/season: different scenes & activities of it.",
    continuityLock: "the festival/season elements + main outfit",
    focusOptions: [ {id:"festive",label:"节日氛围"},{id:"cozy",label:"温馨治愈"},{id:"scenery",label:"季节风景"},{id:"party",label:"欢聚"} ],
    toneBias: ["healing_chill","romantic"],
    test: /圣诞|万圣节|新年|春节|樱花|秋天|雪景|节日|christmas|halloween|new year|sakura|autumn|snow|festival/i,
  },
  {
    id: "lifestyle",
    label: "生活美学",
    organizingLogic: "Theme variations of one aesthetic: different moments sharing the same vibe.",
    continuityLock: "the aesthetic mood + main outfit",
    focusOptions: [ {id:"calm",label:"松弛日常"},{id:"active",label:"活力运动"},{id:"home",label:"居家温度"},{id:"taste",label:"品味格调"} ],
    toneBias: ["healing_chill","narrative_doc"],
    test: /慢生活|日常|居家|晨间|咖啡|健身|瑜伽|跑步|cottagecore|soft life|lifestyle|morning routine|cafe|yoga|running/i,
  },
  {
    id: "journey",
    label: "旅程体验",
    organizingLogic: "Time arc of one trip/experience: arrive -> explore -> highlight -> wind down, different moments in time.",
    continuityLock: "the same trip + main outfit",
    focusOptions: [ {id:"scenery",label:"风景人文"},{id:"food",label:"美食"},{id:"shopping",label:"购物"},{id:"leisure",label:"悠闲放空"} ],
    toneBias: ["narrative_doc","healing_chill"],
    test: /旅行|旅程|游轮|邮轮|度假|出游|citywalk|探店|约会|trip|travel|cruise|vacation|journey|date/i,
  },
];

// 兜底:未命中任何专门类型 → journey(最通用的时间线)
export function getStorylineType(text: string): StorylineTypeDef {
  // 顺序敏感:专门类型在前,journey 在最后兜底
  for (const s of STORYLINE_TYPES) {
    if (s.id !== "journey" && s.test.test(text)) return s;
  }
  return STORYLINE_TYPES.find(s => s.id === "journey")!;
}

export const SCENE_TONES: SceneTone[] = [
  { id: "narrative_doc",     label: "叙事纪实", emoji: "📖", promptFragment: "plain documentary record of the real experience, like candid vlog stills" },
  { id: "surprise_highlight",label: "惊喜高光", emoji: "✨", promptFragment: "emphasize unexpected, delightful, memorable peak moments" },
  { id: "healing_chill",     label: "松弛治愈", emoji: "🌊", promptFragment: "slow, warm, relaxed, savoring-the-moment mood" },
  { id: "cinematic_drama",   label: "电影戏剧", emoji: "🎬", promptFragment: "cinematic tension and a sense of story climax, like film stills" },
  { id: "versailles_flex",   label: "凡尔赛炫耀", emoji: "💎", promptFragment: "understated luxury flex, enviable upper-class lifestyle" },
  { id: "funny_meme",        label: "搞笑沙雕", emoji: "😂", promptFragment: "light, funny, playful, meme-able candid energy" },
  { id: "romantic",          label: "浪漫氛围", emoji: "💕", promptFragment: "soft romantic dreamy atmosphere" },
  { id: "epic_blood",        label: "燃系热血", emoji: "🔥", promptFragment: "high-energy, heroic, adrenaline, epic momentum" },
];

export function getTone(id: string): SceneTone | undefined {
  return SCENE_TONES.find(t => t.id === id);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/constants/scene-storylines.test.ts`
Expected: PASS(4 个用例)

- [ ] **Step 5: 验证**

Run: `pnpm lint`
Expected: 无报错

---

## Phase 2 — 故事线生成

### Task 3: 故事线生成的 prompt 指令

**Files:**
- Modify: `lib/scene/prompts.ts`(新增导出,不删旧的,Task 7 再清理)
- Test: `tests/lib/scene/storyline-prompt.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/lib/scene/storyline-prompt.test.ts
import { STORYLINE_SYSTEM, storylineInstruction } from "@/lib/scene/prompts";

describe("storyline generation prompt", () => {
  it("system 强调 6 个不同场景 + 手机随手拍 + 不露第二人正脸", () => {
    const s = STORYLINE_SYSTEM.toLowerCase();
    expect(s).toContain("different");        // 场景必须不同
    expect(s).toMatch(/phone snapshot|amateur/);
    expect(s).toContain("never show a second person's face");
  });

  it("instruction 注入类型组织逻辑 + 调性 + 侧重 + 张数", () => {
    const ins = storylineInstruction({
      safePrompt: "luxury cruise whale watching",
      organizingLogic: "Time arc of one trip",
      continuityLock: "same trip + main outfit",
      toneFragment: "emphasize peak moments",
      focusLabel: "自然奇观",
      shotCount: 6,
      companion: null,
    });
    expect(ins).toContain("luxury cruise whale watching");
    expect(ins).toContain("Time arc of one trip");
    expect(ins).toContain("emphasize peak moments");
    expect(ins).toContain("6");
  });

  it("有 companion 时注入'第二人不露脸'", () => {
    const ins = storylineInstruction({ safePrompt: "x", organizingLogic: "y", continuityLock: "z", toneFragment: "t", focusLabel: "f", shotCount: 6, companion: "a friend" });
    expect(ins.toLowerCase()).toContain("second person");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/storyline-prompt.test.ts`
Expected: FAIL(未导出)

- [ ] **Step 3: 在 `lib/scene/prompts.ts` 追加**

```ts
// ── 故事线生成(v2)──────────────────────────────
export const STORYLINE_SYSTEM = `You are SceneSelf's story director. A user uploads ONE selfie and a short dream-experience. You design a cohesive set of photos that tells ONE story as a sequence of DIFFERENT scenes/moments — like a real phone photo dump of that experience.

ABSOLUTE rules:
1. Each photo MUST be a DIFFERENT scene — different setting AND different activity. NEVER the same place shot from several angles. If two beats could be swapped without anyone noticing, rewrite them.
2. The set must read as ONE continuous experience of the SAME person: lock a MAIN outfit across most beats; at most 1-2 beats may change wardrobe when the scene truly calls for it (e.g. an evening gala dress, a swimsuit).
3. Each beat gets a shot_perspective: "selfie" (subject holding the phone, arm's-length, slightly tilted) or "friend_candid" (a friend/bystander captured the subject, who happens to be in frame). Vary them naturally; the surprising/peak beat often works as friend_candid.
4. Real phone snapshot look only: deep focus, no bokeh, natural exposure, real skin texture. NOT professional photography, NOT a fashion editorial.
5. If a companion is given, the second person appears ONLY as back view / side silhouette / a held hand / blurred — NEVER show a second person's face, and never rely on their identity.
6. Exactly ONE beat is the highlight (is_highlight=true) that pays off the tone.

Reply STRICT JSON only, no markdown fences.`;

export interface StorylineInstructionInput {
  safePrompt: string;
  organizingLogic: string;
  continuityLock: string;
  toneFragment: string;
  focusLabel: string;
  shotCount: number;
  companion: string | null;
}

export function storylineInstruction(i: StorylineInstructionInput): string {
  return `Experience: "${i.safePrompt}".
Organizing logic for THIS story (follow it): ${i.organizingLogic}
Continuity to lock across the set: ${i.continuityLock}
Tone / feeling: ${i.toneFragment}. Focus emphasis: ${i.focusLabel}.
${i.companion ? `Companion present: ${i.companion} — but show them ONLY as back view / side silhouette / held hand / blurred, never their face.` : ""}
Produce EXACTLY ${i.shotCount} beats, each a DIFFERENT scene (different setting + activity). Exactly one beat has is_highlight=true.
Reply ONLY JSON of this shape:
{"beats":[{"index":1,"scene_title":"...","setting":"concrete place/environment","activity":"what they're doing","shot_perspective":"selfie|friend_candid","shot_size":"wide|medium","wardrobe":"main or change:<desc>","expression_beat":"distinct micro-expression","is_highlight":false${i.companion ? `,"companion":"${i.companion} as back view/silhouette"` : ""}}]}
Rules: settings across the ${i.shotCount} beats must be visibly different; at least half shot_size=wide; at most 1-2 wardrobe changes; exactly one is_highlight=true.`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/lib/scene/storyline-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: 验证** — `pnpm lint`

---

### Task 4: 故事线生成服务(LLM + fallback)

**Files:**
- Create: `lib/scene/services/story-line.ts`
- Test: `tests/lib/scene/story-line.test.ts`

- [ ] **Step 1: 写失败测试**(mock LLM,验证解析 + fallback)

```ts
// tests/lib/scene/story-line.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const chatMock = vi.fn();
vi.mock("@/lib/openrouter/chat", () => ({ createOpenRouterChat: (...a: unknown[]) => chatMock(...a) }));
vi.mock("@/lib/scene/config", () => ({ sceneConfig: { textModel: "t" }, hasTextProviderKey: () => true }));

import { generateStoryline, fallbackStoryline } from "@/lib/scene/services/story-line";

beforeEach(() => chatMock.mockReset());

const input = { safePrompt: "luxury cruise whale watching", storylineType: "journey" as const, toneId: "surprise_highlight", focusId: "scenery", shotCount: 6, companion: null };

describe("generateStoryline", () => {
  it("解析 LLM 返回的 6 个 beat", async () => {
    chatMock.mockResolvedValueOnce(JSON.stringify({ beats: Array.from({length:6}, (_,i)=>({
      index:i+1, scene_title:`s${i}`, setting:`place ${i}`, activity:`act ${i}`,
      shot_perspective: i===3?"friend_candid":"selfie", shot_size: i%2?"medium":"wide",
      wardrobe:"main", expression_beat:`e${i}`, is_highlight: i===3,
    })) }));
    const beats = await generateStoryline(input);
    expect(beats).toHaveLength(6);
    expect(new Set(beats.map(b=>b.setting)).size).toBe(6); // 场景互不相同
    expect(beats.filter(b=>b.is_highlight)).toHaveLength(1);
  });

  it("LLM 失败时走 fallback,仍产出 N 个不同场景", async () => {
    chatMock.mockRejectedValueOnce(new Error("net"));
    const beats = await generateStoryline(input);
    expect(beats).toHaveLength(6);
    expect(new Set(beats.map(b=>b.setting)).size).toBe(6);
  });

  it("fallbackStoryline 不依赖 LLM,产出不同场景 + 恰一个高潮", () => {
    const beats = fallbackStoryline(input);
    expect(beats).toHaveLength(6);
    expect(new Set(beats.map(b=>b.scene_title)).size).toBe(6);
    expect(beats.filter(b=>b.is_highlight)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/story-line.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 创建 `lib/scene/services/story-line.ts`**

```ts
// StorylineService:两段式第一步。据 [输入+类型+调性+侧重] 生成 6 个不同场景的 StoryBeat。
// 有 OPENROUTER key → LLM 出 JSON;失败/无 key → fallback 通用多场景骨架。
import { createOpenRouterChat } from "../../openrouter/chat";
import { sceneConfig, hasTextProviderKey } from "../config";
import { STORYLINE_SYSTEM, storylineInstruction } from "../prompts";
import { STORYLINE_TYPES, getTone } from "../../../constants/scene-storylines";
import type { StoryBeat, StorylineType, ShotSize, ShotPerspective } from "../types";

export interface StorylineInput {
  safePrompt: string;
  storylineType: StorylineType;
  toneId: string;
  focusId: string;
  shotCount: number;
  companion: string | null;
}

function parseBeats(text: string, shotCount: number): StoryBeat[] | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try {
    const j = JSON.parse(cleaned.slice(s, e + 1)) as { beats?: unknown[] };
    if (!Array.isArray(j.beats) || j.beats.length === 0) return null;
    const beats = j.beats.slice(0, shotCount).map((raw, i) => {
      const b = raw as Record<string, unknown>;
      return {
        index: i + 1,
        scene_title: String(b.scene_title ?? `scene ${i + 1}`),
        setting: String(b.setting ?? ""),
        activity: String(b.activity ?? ""),
        shot_perspective: (b.shot_perspective === "friend_candid" ? "friend_candid" : "selfie") as ShotPerspective,
        shot_size: (b.shot_size === "wide" ? "wide" : "medium") as ShotSize,
        wardrobe: typeof b.wardrobe === "string" && b.wardrobe ? (b.wardrobe as string) : "main",
        expression_beat: String(b.expression_beat ?? "candid natural"),
        is_highlight: !!b.is_highlight,
        ...(typeof b.companion === "string" && b.companion ? { companion: b.companion as string } : {}),
      } satisfies StoryBeat;
    });
    if (beats.length < shotCount) return null;        // 数量不足视为失败,走 fallback
    if (!beats.some(b => b.is_highlight)) beats[0].is_highlight = true; // 保证恰一个高潮
    return beats;
  } catch {
    return null;
  }
}

// 通用 fallback:无 LLM 时也产出"明显不同的场景",按时间/空间铺开。
const FALLBACK_BEATS: { title: string; setting: (p: string) => string; activity: string; size: ShotSize; persp: ShotPerspective }[] = [
  { title: "抵达/开场", setting: p => `arriving at the scene of "${p}", wide establishing view`, activity: "taking it all in", size: "wide", persp: "friend_candid" },
  { title: "靠近体验", setting: p => `up close in the heart of "${p}"`, activity: "engaging with the moment", size: "medium", persp: "selfie" },
  { title: "细节时刻", setting: p => `a quieter corner during "${p}"`, activity: "a small candid detail", size: "medium", persp: "selfie" },
  { title: "高潮瞬间", setting: p => `the standout highlight of "${p}"`, activity: "the peak moment", size: "wide", persp: "friend_candid" },
  { title: "另一面", setting: p => `a different side/angle of "${p}", new location`, activity: "another distinct activity", size: "wide", persp: "selfie" },
  { title: "收尾", setting: p => `winding down at the end of "${p}"`, activity: "relaxed closing", size: "medium", persp: "friend_candid" },
];

export function fallbackStoryline(input: StorylineInput): StoryBeat[] {
  const n = input.shotCount;
  return Array.from({ length: n }, (_, i) => {
    const t = FALLBACK_BEATS[i % FALLBACK_BEATS.length];
    const suffix = i < FALLBACK_BEATS.length ? "" : ` (${Math.floor(i / FALLBACK_BEATS.length) + 1})`;
    return {
      index: i + 1,
      scene_title: t.title + suffix,
      setting: t.setting(input.safePrompt) + suffix,
      activity: t.activity,
      shot_perspective: t.persp,
      shot_size: t.size,
      wardrobe: "main",
      expression_beat: "candid natural",
      is_highlight: i === 3 % n,
      ...(input.companion ? { companion: `${input.companion} as a back-view silhouette` } : {}),
    } satisfies StoryBeat;
  });
}

export async function generateStoryline(input: StorylineInput): Promise<StoryBeat[]> {
  if (!hasTextProviderKey()) return fallbackStoryline(input);
  const typeDef = STORYLINE_TYPES.find(s => s.id === input.storylineType) ?? STORYLINE_TYPES.find(s => s.id === "journey")!;
  const tone = getTone(input.toneId);
  const focusLabel = typeDef.focusOptions.find(f => f.id === input.focusId)?.label ?? typeDef.focusOptions[0].label;
  try {
    const text = await createOpenRouterChat(
      [
        { role: "system", content: STORYLINE_SYSTEM },
        { role: "user", content: storylineInstruction({
          safePrompt: input.safePrompt,
          organizingLogic: typeDef.organizingLogic,
          continuityLock: typeDef.continuityLock,
          toneFragment: tone?.promptFragment ?? "natural candid feeling",
          focusLabel,
          shotCount: input.shotCount,
          companion: input.companion,
        }) },
      ],
      { temperature: 0.8, max_tokens: 2048, model: sceneConfig.textModel, reasoningEffort: "minimal" },
    );
    return parseBeats(text, input.shotCount) ?? fallbackStoryline(input);
  } catch {
    return fallbackStoryline(input);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/lib/scene/story-line.test.ts`
Expected: PASS(3 个用例)

- [ ] **Step 5: 验证** — `pnpm lint`

---

## Phase 3 — prompt 展开

### Task 5: StoryBeat → image_prompt 展开

**Files:**
- Modify: `lib/scene/scene-plan.ts`(新增 `buildFramePromptFromBeat`,暂不删旧函数)
- Test: `tests/lib/scene/beat-prompt.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/lib/scene/beat-prompt.test.ts
import { buildFramePromptFromBeat } from "@/lib/scene/scene-plan";
import type { StoryBeat, SceneContinuity } from "@/lib/scene/types";

const cont: SceneContinuity = {
  outfit: "cream knit sweater and dark jeans", accessory: "small tan crossbody bag",
  hairstyle: "long loose wavy hair", jewelry: "thin gold necklace only", shoes: "white sneakers",
  camera_style: "iPhone main camera, auto HDR, 4:5", film_look: "natural daylight, real skin texture",
};
const beat: StoryBeat = {
  index: 4, scene_title: "看鲸鱼", setting: "ship deck railing facing open sea", activity: "pointing at a whale spout, surprised",
  shot_perspective: "friend_candid", shot_size: "wide", wardrobe: "main", expression_beat: "surprised, turning back", is_highlight: true,
};

describe("buildFramePromptFromBeat", () => {
  it("场景描述用 beat 的 setting+activity(不是整体主题)", () => {
    const p = buildFramePromptFromBeat("a cruise trip", beat, cont);
    expect(p).toContain("ship deck railing facing open sea");
    expect(p).toContain("pointing at a whale spout");
  });
  it("friend_candid 注入旁观者视角措辞", () => {
    const p = buildFramePromptFromBeat("x", beat, cont).toLowerCase();
    expect(p).toMatch(/friend|bystander/);
  });
  it("selfie 注入举手机自拍措辞", () => {
    const p = buildFramePromptFromBeat("x", { ...beat, shot_perspective: "selfie" }, cont).toLowerCase();
    expect(p).toMatch(/arm'?s-length|selfie/);
  });
  it("换装时用新造型而非主 outfit", () => {
    const p = buildFramePromptFromBeat("x", { ...beat, wardrobe: "change:black evening gown" }, cont);
    expect(p).toContain("black evening gown");
  });
  it("锁主造型 + 手机随手拍底色", () => {
    const p = buildFramePromptFromBeat("x", beat, cont).toLowerCase();
    expect(p).toContain("same person as the reference selfie");
    expect(p).toMatch(/deep focus|no bokeh|phone/);
  });
  it("有 companion 时要求第二人不露脸", () => {
    const p = buildFramePromptFromBeat("x", { ...beat, companion: "a friend as silhouette" }, cont).toLowerCase();
    expect(p).toMatch(/back view|silhouette|never show.*face/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/beat-prompt.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 `lib/scene/scene-plan.ts` 追加** `buildFramePromptFromBeat`

```ts
import type { StoryBeat } from "./types"; // 若文件顶部未导入则补上

// StoryBeat → 每帧 image_prompt(v2)。场景用 beat 自己的 setting+activity;
// 视角(自拍/朋友拍)、换装、陪伴(不露脸)按 beat 注入;统一手机随手拍底色。
export function buildFramePromptFromBeat(
  safePrompt: string,
  beat: StoryBeat,
  c: SceneContinuity,
): string {
  const outfit = beat.wardrobe.startsWith("change:")
    ? beat.wardrobe.slice("change:".length).trim()
    : c.outfit;

  const perspective = beat.shot_perspective === "selfie"
    ? "shot as a SELFIE: the subject holds the phone at arm's-length, slightly tilted, casual"
    : "shot by a FRIEND or bystander who caught the subject candidly in frame";

  const sizeGuidance = beat.shot_size === "wide"
    ? "wide environmental shot from 5-7 meters, face under 8% of frame, the scene dominates"
    : "medium shot from 3-4 meters, face under 18% of frame, environment still fills most of it";

  const parts = [
    `casual phone snapshot, NOT professional. THIS photo is one specific moment: ${beat.setting} — ${beat.activity}. (Overall experience: ${safePrompt}.)`,
    `same person as the reference selfie`,
    perspective,
    `Outfit (same across the set unless noted): ${outfit}`,
    `Hair (locked): ${c.hairstyle}; jewelry: ${c.jewelry}; shoes: ${c.shoes}; accessory: ${c.accessory}`,
    `Camera & color: ${c.camera_style}, ${c.film_look}`,
    sizeGuidance,
    `Expression for THIS frame (do not reuse): ${beat.expression_beat}`,
    "realistic 4:5 phone snapshot, deep focus (everything sharp, NO background bokeh), natural exposure, visible skin texture, imperfect framing",
    "NO studio lighting, NO portrait-mode bokeh, NO magazine/editorial composition, NO golden-hour fashion-shoot framing, no text, no watermark, creative imagined scene only",
  ];
  if (c.anchor_object) {
    parts.push(`the EXACT same ${c.anchor_object.name} visible — ${c.anchor_object.appearance} — identical across every photo`);
  }
  if (beat.companion) {
    parts.push(`a second person is present ONLY as back view / side silhouette / a held hand / blurred — NEVER show the second person's face: ${beat.companion}`);
  }
  return parts.join(", ");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/lib/scene/beat-prompt.test.ts`
Expected: PASS(6 个用例)

- [ ] **Step 5: 验证** — `pnpm lint`

---

## Phase 4 — 集成与清理

### Task 6: classifyScene 输出 storyline_type + 调性预选

**Files:**
- Modify: `lib/scene/services/scene-planner.ts`(新增 `analyzeInput`,不动旧 `classifyScene` 签名以免破坏其它调用)
- Test: `tests/lib/scene/analyze-input.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/lib/scene/analyze-input.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/openrouter/chat", () => ({ createOpenRouterChat: vi.fn().mockRejectedValue(new Error("no key path")) }));
vi.mock("@/lib/scene/config", () => ({ sceneConfig: { textModel: "t" }, hasTextProviderKey: () => false }));
import { analyzeInput } from "@/lib/scene/services/scene-planner";

describe("analyzeInput (fallback path, no LLM)", () => {
  it("据关键词判 storyline_type + 给该类的调性预选与侧重选项", async () => {
    const r = await analyzeInput("我买了一架私人直升机");
    expect(r.storyline_type).toBe("ownership_flex");
    expect(r.tone_suggestions.length).toBeGreaterThanOrEqual(1);
    expect(r.focus_options.length).toBeGreaterThanOrEqual(3);
  });
  it("旅程类兜底", async () => {
    const r = await analyzeInput("去三亚旅行");
    expect(r.storyline_type).toBe("journey");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/analyze-input.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 `lib/scene/services/scene-planner.ts` 追加**

```ts
import { getStorylineType, STORYLINE_TYPES } from "../../../constants/scene-storylines";
import type { StorylineType } from "../types";

export interface InputAnalysis {
  storyline_type: StorylineType;
  tone_suggestions: string[];               // 高亮的调性 id(1-2 个)
  focus_options: { id: string; label: string }[]; // Q2 侧重选项(该类专属)
}

// 分析用户输入:判故事线类型 + 调性预选 + 侧重选项。
// LLM 可用时可让其更准地判类型与预选(可选增强);此处保证 fallback 也可用。
export async function analyzeInput(safePrompt: string): Promise<InputAnalysis> {
  const typeDef = getStorylineType(safePrompt);
  // MVP:类型与预选用规则(确定、零延迟)。后续可加 LLM 复核。
  return {
    storyline_type: typeDef.id,
    tone_suggestions: typeDef.toneBias.slice(0, 2),
    focus_options: typeDef.focusOptions,
  };
}

// 给调用方一个按 id 拿组织逻辑的便捷查询(buildScenePlan 用)
export function storylineDef(id: StorylineType) {
  return STORYLINE_TYPES.find(s => s.id === id) ?? STORYLINE_TYPES.find(s => s.id === "journey")!;
}
```

- [ ] **Step 4: 跑测试确认通过** — Run: `pnpm test tests/lib/scene/analyze-input.test.ts` → PASS

- [ ] **Step 5: 验证** — `pnpm lint`

---

### Task 7: buildScenePlan 接两段式 + 移除旧叙事弧

**Files:**
- Modify: `lib/scene/services/scene-planner.ts`(`buildScenePlan`)
- Modify: `lib/scene/scene-plan.ts`(移除 `VEHICLE_ARC`/`OBJECT_ARC`/`GENERIC_ARC`/`VEHICLE_ARC_ACTION`/`VEHICLE_ARC_ARRIVAL`/`narrativeBeats`/`fitArc`/`storyArcEmphasis`/`buildFramePrompt` 及其在 `buildFallbackScenePlan`、`applyPlanPostProcessing` 的使用)
- Test: `tests/lib/scene/storyline-plan.test.ts`,并更新/删除依赖旧 ARC 的测试

- [ ] **Step 1: 写失败测试**(buildScenePlan 产出多场景 plan)

```ts
// tests/lib/scene/storyline-plan.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/scene/config", () => ({ sceneConfig: { textModel: "t" }, hasTextProviderKey: () => false }));
import { buildScenePlan } from "@/lib/scene/services/scene-planner";

describe("buildScenePlan v2 (no-LLM fallback)", () => {
  it("产出 6 帧,场景互不相同,每帧 image_prompt 含本帧场景", async () => {
    const plan = await buildScenePlan("luxury cruise whale watching", { tone: "惊喜高光", focus: "自然奇观" }, 6);
    expect(plan.shots).toHaveLength(6);
    const settings = plan.shots.map(s => s.summary);
    expect(new Set(settings).size).toBe(6);          // 不同场景
    for (const s of plan.shots) expect(s.image_prompt).toContain(s.summary.slice(0, 8));
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm test tests/lib/scene/storyline-plan.test.ts` → FAIL

- [ ] **Step 3: 重写 `buildScenePlan`**(`lib/scene/services/scene-planner.ts`)

把现有 `buildScenePlan` 替换为两段式。`answers` 里取 tone/focus(前端 Plan B 会传 tone id/label 与 focus;此处兼容 label 或 id,缺失则用该类默认):

```ts
import { analyzeInput, storylineDef } from "./scene-planner"; // 同文件内,直接调用即可(无需 import 自身)
import { generateStoryline } from "./story-line";
import { buildFramePromptFromBeat, buildFallbackContinuity } from "../scene-plan";
import { SCENE_TONES } from "../../../constants/scene-storylines";

// 注:answers 形如 { tone?: string(id或label), focus?: string(id或label), companion?: string }
export async function buildScenePlan(
  safePrompt: string,
  answers: Record<string, string>,
  shotCount: number,
): Promise<ScenePlan> {
  const analysis = await analyzeInput(safePrompt);
  const def = storylineDef(analysis.storyline_type);

  // 解析调性:优先 answers.tone(id 或中文 label),否则用预选第一个
  const toneId = resolveToneId(answers.tone) ?? analysis.tone_suggestions[0] ?? SCENE_TONES[0].id;
  const focusId = resolveFocusId(def, answers.focus) ?? def.focusOptions[0].id;
  const companion = answers.companion?.trim() || null;

  const beats = await generateStoryline({
    safePrompt, storylineType: def.id, toneId, focusId, shotCount, companion,
  });

  // 主造型 continuity(沿用既有 activity styling + user color override 逻辑)
  const continuity = buildFallbackContinuity(safePrompt, answers);

  const shots = beats.map(b => ({
    index: b.index,
    narrative_role: b.scene_title,
    summary: b.setting,
    shot_size: b.shot_size,
    face_orientation: "front_or_three_quarter",
    lighting: "natural light",
    is_candid: true,
    expression_beat: b.expression_beat,
    image_prompt: buildFramePromptFromBeat(safePrompt, b, continuity),
  }));

  return {
    scenario: slugForPlan(safePrompt),
    scenario_cluster: "aesthetic_lifestyle", // 旧字段保留兼容;v2 主用 storyline_type
    risk_level: "low",
    coherence_type: "aesthetic_series",
    title: titleForPlan(safePrompt),
    set_premise: `A storyline photo set of: ${safePrompt}`,
    set_structure: beats.map(b => b.scene_title),
    continuity,
    shots,
  };
}

function resolveToneId(v?: string): string | null {
  if (!v) return null;
  const byId = SCENE_TONES.find(t => t.id === v);
  if (byId) return byId.id;
  const byLabel = SCENE_TONES.find(t => t.label === v);
  return byLabel?.id ?? null;
}
function resolveFocusId(def: ReturnType<typeof storylineDef>, v?: string): string | null {
  if (!v) return null;
  return def.focusOptions.find(f => f.id === v || f.label === v)?.id ?? null;
}
```

> 说明:`buildFallbackContinuity`、`slugForPlan`、`titleForPlan` 是从现有 `scene-plan.ts` 的 `buildFallbackScenePlan` 抽出的小工具(主造型 styling + user color override + slug/title)。在 Task 7 把它们从 `buildFallbackScenePlan` 内联逻辑提取为导出函数,`buildScenePlan` 复用。现有 `applyPlanPostProcessing` 的 activity styling 与 color override 逻辑迁入 `buildFallbackContinuity`。

- [ ] **Step 4: 在 `lib/scene/scene-plan.ts` 提取 continuity 工具 + 删除旧叙事弧**

- 新增导出 `buildFallbackContinuity(safePrompt, answers)`:把现有 `buildFallbackScenePlan` 里"`detectActivity` → ACTIVITY_STYLING / DEFAULT_STYLING + `extractColorAnswer` color override + camera_style/film_look + anchor_object"那段逻辑搬进来,返回 `SceneContinuity`。
- 导出 `slugForPlan`/`titleForPlan`(即现有 `slug`/`titleCase`)。
- 删除:`VEHICLE_KEYWORDS`、`VEHICLE_ARC`、`OBJECT_ARC`、`GENERIC_ARC`、`VEHICLE_ARC_ACTION`、`VEHICLE_ARC_ARRIVAL`、`ArcBeat`、`NarrativeBeat`、`fitArc`、`narrativeBeats`、`storyArcEmphasis`、`StoryEmphasis`、旧 `buildFramePrompt`、旧 `buildFallbackScenePlan`、旧 `applyPlanPostProcessing`(其职责被 buildScenePlan + buildFallbackContinuity 取代)。
- `lib/scene/services/index.ts`:导出 `generateStoryline`;移除已删函数(`buildSetPrompt` 等若不再用)的导出。

- [ ] **Step 5: 更新/删除依赖旧 ARC 的测试**

删除或改写:`tests/lib/scene/narrative-arc.test.ts`(旧 narrativeBeats/storyArcEmphasis,已被故事线取代 → 删除)、`tests/lib/scene/scene-plan.test.ts` 中针对 `defaultSetStructure`/旧 `buildFallbackScenePlan` 的用例(改为针对 `buildFallbackContinuity`)、`tests/lib/scene/anchor-object.test.ts`/`outfit-lock.test.ts`/`realism-lock.test.ts`/`no-close-shot.test.ts`/`plan-post-process.test.ts` 中断言旧 `buildSetPrompt`/`buildFramePrompt`/`applyPlanPostProcessing` 文案的用例 → 改为断言 `buildFramePromptFromBeat` 的等价性质(锁造型/手机随手拍/无 close)。

> 逐个跑这些测试文件,把"针对旧实现文案"的断言改成"针对新 `buildFramePromptFromBeat` 的等价性质"。orchestrator/reference-chaining/质检/pricing/delivery 等测试**不动**(它们依赖注入 `generateImage`,与本次解耦)。

- [ ] **Step 6: 跑测试确认通过** — Run: `pnpm test tests/lib/scene/storyline-plan.test.ts` → PASS

- [ ] **Step 7: 验证** — `pnpm lint`

---

### Task 8: 全量回归 + 接口确认

**Files:** 无新增,验证为主。

- [ ] **Step 1: 确认 plan/route 兼容**

`app/api/scene/plan/route.ts` 调 `buildScenePlan(safePrompt, answers ?? {}, shotCountForTier(t))` — 新签名一致(answers 现读 tone/focus/companion,旧 answers 多余键忽略)。无需改 route。读一遍确认。

- [ ] **Step 2: 跑全部 scene 测试**

Run: `pnpm test tests/lib/scene tests/constants`
Expected: 全绿(新增 storyline 测试通过,旧 ARC 测试已删/改)

- [ ] **Step 3: 全量测试 + lint**

Run: `pnpm test` 然后 `pnpm lint`
Expected: 全绿、无 lint 报错

- [ ] **Step 4: 手动冒烟(可选,需 OPENROUTER key)**

启动 dev,过一次 `/create`:输入"豪华游轮看鲸鱼",确认生成的 6 张是**不同场景**(甲板/餐厅/看鲸鱼/船头/派对…),而非同一甲板。

---

## Self-Review(写完计划后我已核对)

- **Spec 覆盖**:8 类类型库(Task 2)/ 两段式分类+生成(Task 4,6)/ 多场景 prompt(Task 5)/ 调性库(Task 2)/ 主造型+换装(Task 5 wardrobe)/ AI 自动视角(Task 5 perspective)/ 陪伴修饰(Task 5 companion)/ 移除旧叙事弧(Task 7)。前端问答 UI、AI 预选高亮 = Plan B(本计划产出 `analyzeInput` 供其调用)。
- **Placeholder**:无 TBD;所有类型、常量、函数、测试均给完整代码。Task 7 的"删除清单"用精确符号名;continuity 提取用精确来源描述。
- **类型一致**:`StoryBeat`/`StorylineType`/`SceneTone`(Task 1)在 Task 2/4/5/6/7 一致使用;`generateStoryline` 入参 `StorylineInput`、`buildFramePromptFromBeat(safePrompt,beat,continuity)` 签名前后一致。

## Execution Handoff

见正文后的执行选择。
