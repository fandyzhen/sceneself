# 类型感知造型/道具/视角修复 — Plan A2

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 checkbox(`- [ ]`)。

**Goal:** 让人物造型/道具/拍摄视角跟着故事线类型走——古代穿盔甲不穿现代装、不自拍不背现代包;selfie 改真前置视角(看不到拿手机的手)。

**Architecture:** ① 故事线生成时 LLM 连 set-level 造型(SceneAttire)一起产出,按 era/类型给古装/制服/正式装,取代硬编码现代 styling。② 每个 `StorylineTypeDef` 标 `era`/`allowSelfie`/`allowModernProps`,约束注入生成 prompt + 每帧 prompt negative。③ `buildFramePromptFromBeat` 的 selfie 改前置摄像头视角。

**Tech Stack:** TypeScript / Vitest / pnpm / OpenRouter(Gemini Lite,经 `createOpenRouterChat`)。

> ⚠️ 本项目非 git 仓库:每个 Task 末尾"提交"改为 **跑相关测试 + `pnpm lint`**,不要执行 git 命令。
> 设计依据:`docs/superpowers/specs/2026-06-04-storyline-scene-generation-design.md` 的 **2.3 节**。

## File Structure

| 文件 | 动作 | 责任 |
|---|---|---|
| `lib/scene/types.ts` | modify | 新增 `SceneAttire`、`Era`;`StorylineConstraints` |
| `constants/scene-storylines.ts` | modify | `StorylineTypeDef` 加 `era`/`allowSelfie`/`allowModernProps`/`attireHint`;8 类标注 |
| `lib/scene/prompts.ts` | modify | `storylineInstruction` 让 LLM 也出 `attire` + 注入 era 约束 |
| `lib/scene/services/story-line.ts` | modify | `generateStoryline` 返回 `{attire, beats}`;parse + fallback attire |
| `lib/scene/scene-plan.ts` | modify | `buildFramePromptFromBeat` selfie 真前置 + era/props negative(加 constraints 参数);新增 `buildContinuityFromAttire` |
| `lib/scene/services/scene-planner.ts` | modify | `buildScenePlan` 接 `{attire, beats}` + 传 constraints |
| `lib/scene/services/quality-check.ts` | modify | QUALITY_PROMPT 收紧:多手/多肢必判 deformity |

---

## Task 1: era 约束字段 + 8 类标注

**Files:** Modify `lib/scene/types.ts`、`constants/scene-storylines.ts`;Test `tests/constants/scene-storylines-era.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// tests/constants/scene-storylines-era.test.ts
import { STORYLINE_TYPES, getStorylineType } from "@/constants/scene-storylines";

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
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm test tests/constants/scene-storylines-era.test.ts`

- [ ] **Step 3: 在 `lib/scene/types.ts` 追加**

```ts
export type Era = 'modern' | 'historical' | 'fantasy' | 'future';

export interface SceneAttire {
  outfit: string;     // 类型适配:古代→盔甲战袍;医生→白大褂;婚礼→婚纱
  hairstyle: string;
  accessory: string;  // 古代→佩剑;现代→crossbody包;正式→no bag
}

export interface StorylineConstraints {
  era: Era;
  allowSelfie: boolean;
  allowModernProps: boolean;
}
```

- [ ] **Step 4: 在 `constants/scene-storylines.ts` 的 `StorylineTypeDef` 加字段并标注 8 类**

给 `StorylineTypeDef` interface 加:
```ts
  era: import("@/lib/scene/types").Era;
  allowSelfie: boolean;
  allowModernProps: boolean;
  attireHint: string;  // 英文,注入造型生成
```

为每个类型补这 4 个字段(其余字段不动):
- `journey`: era:"modern", allowSelfie:true, allowModernProps:true, attireHint:"modern casual travel outfit fitting the destination"
- `ownership_flex`: era:"modern", allowSelfie:true, allowModernProps:true, attireHint:"sleek modern outfit that reads affluent"
- `fantasy_role`: era:"fantasy", allowSelfie:false, allowModernProps:false, attireHint:"full period/character costume (e.g. ancient general's armor and war robe, or the superhero suit) — absolutely NO modern clothing"
- `milestone_event`: era:"modern", allowSelfie:true, allowModernProps:false, attireHint:"formal attire for the occasion (wedding dress / graduation gown / gala dress / sharp suit) — no casual jeans/sneakers"
- `profession`: era:"modern", allowSelfie:true, allowModernProps:false, attireHint:"the profession's real uniform/attire (doctor's white coat, chef's whites, pilot's uniform, executive suit)"
- `lifestyle`: era:"modern", allowSelfie:true, allowModernProps:true, attireHint:"modern everyday outfit matching the activity (athletic wear for workouts)"
- `seasonal`: era:"modern", allowSelfie:true, allowModernProps:true, attireHint:"season/festival-appropriate outfit (warm winter clothes for snow, costume for Halloween)"
- `transformation`: era:"modern", allowSelfie:true, allowModernProps:true, attireHint:"outfit that visibly evolves across the set (start look → transformed look)"

> 注:`fantasy_role` 实测是古代/超人,统一标 `era:"fantasy"`(prompt 里用 attireHint 区分古代/未来);historical 与 fantasy 在约束上等价(都禁现代),无需再细分。

- [ ] **Step 5: 跑测试 PASS + `pnpm lint`**

---

## Task 2: storylineInstruction 出造型 + era 约束

**Files:** Modify `lib/scene/prompts.ts`;Test 追加到 `tests/lib/scene/storyline-prompt.test.ts`

- [ ] **Step 1: 失败测试**(追加)

```ts
import { STORYLINE_SYSTEM, storylineInstruction } from "@/lib/scene/prompts";

describe("storyline instruction — attire & era", () => {
  it("注入 attireHint,要求 LLM 输出 attire", () => {
    const ins = storylineInstruction({
      safePrompt:"穿越古代当将军", organizingLogic:"x", continuityLock:"y",
      toneFragment:"t", focusLabel:"f", shotCount:6, companion:null,
      attireHint:"ancient general's armor", era:"fantasy", allowSelfie:false, allowModernProps:false,
    });
    expect(ins).toContain("ancient general's armor");
    expect(ins.toLowerCase()).toContain("attire");
    expect(ins.toLowerCase()).toMatch(/no selfie|never.*selfie|no modern/);
  });
  it("modern 类不强制禁自拍", () => {
    const ins = storylineInstruction({
      safePrompt:"游轮", organizingLogic:"x", continuityLock:"y", toneFragment:"t", focusLabel:"f",
      shotCount:6, companion:null, attireHint:"modern casual", era:"modern", allowSelfie:true, allowModernProps:true,
    });
    expect(ins).toContain("modern casual");
  });
});
```

- [ ] **Step 2: 跑测试失败**

- [ ] **Step 3: 改 `StorylineInstructionInput` 与 `storylineInstruction`**(`lib/scene/prompts.ts`)

`StorylineInstructionInput` 加字段:`attireHint: string; era: string; allowSelfie: boolean; allowModernProps: boolean;`

`storylineInstruction` 体内,在要求 JSON 之前加造型 + era 约束,并把输出 JSON 形状改为带 `attire`:

```ts
export function storylineInstruction(i: StorylineInstructionInput): string {
  const eraRule = (i.era === "historical" || i.era === "fantasy" || i.era === "future")
    ? `This is a ${i.era} setting: NO modern phones, NO selfies, NO modern handbags/sneakers anywhere in the set. shot_perspective must always be "friend_candid".`
    : (!i.allowModernProps ? `Formal/professional setting: no casual crossbody bag.` : ``);
  const selfieRule = i.allowSelfie ? `` : `Do NOT use shot_perspective "selfie" for any beat.`;
  return `Experience: "${i.safePrompt}".
Organizing logic: ${i.organizingLogic}
Continuity to lock: ${i.continuityLock}
Tone: ${i.toneFragment}. Focus: ${i.focusLabel}.
ATTIRE — design ONE set-level outfit fitting this exact scenario: ${i.attireHint}. Lock it across the set (a transformation set may evolve it across 1-2 beats).
${eraRule} ${selfieRule}
${i.companion ? `Companion present: ${i.companion} — show ONLY as back view/silhouette/held hand, never their face.` : ""}
Produce EXACTLY ${i.shotCount} beats, each a DIFFERENT scene (different setting + activity). Exactly one beat is_highlight=true.
Reply ONLY JSON of this shape:
{"attire":{"outfit":"specific period/role-appropriate outfit","hairstyle":"...","accessory":"period/role-appropriate prop or 'none'"},"beats":[{"index":1,"scene_title":"...","setting":"concrete place","activity":"...","shot_perspective":"selfie|friend_candid","shot_size":"wide|medium","wardrobe":"main or change:<desc>","expression_beat":"...","is_highlight":false}]}
Rules: settings visibly different; at least half wide; the attire MUST fit the era (no modern clothing in historical/fantasy); ${i.allowSelfie ? "" : "all beats friend_candid;"} exactly one is_highlight=true.`;
}
```

- [ ] **Step 4: 跑测试 PASS + `pnpm lint`**

---

## Task 3: generateStoryline 返回 {attire, beats}

**Files:** Modify `lib/scene/services/story-line.ts`;Test 改写 `tests/lib/scene/story-line.test.ts`

- [ ] **Step 1: 改写测试**(返回结构变了)

```ts
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
```

- [ ] **Step 2: 跑测试失败**

- [ ] **Step 3: 改 `lib/scene/services/story-line.ts`**

- `StorylineResult` 新类型:`export interface StorylineResult { attire: SceneAttire; beats: StoryBeat[] }`(import `SceneAttire`)
- `parseBeats` → 改为解析 `{attire, beats}`,返回 `StorylineResult | null`(attire 缺失时给保守默认,beats 数不足返回 null)
- `fallbackStoryline(input)` → 返回 `StorylineResult`:
  - 据 input.storylineType 查 `STORYLINE_TYPES` 的 `era`/`allowSelfie`;era≠modern 时所有 beat 强制 `shot_perspective:"friend_candid"`
  - attire:用该类型 `attireHint` 派生一个简短兜底(fantasy→"period costume fitting the scene, no modern clothing";modern→现有 `buildFallbackContinuity` 的现代装可继续作兜底,但这里只需 outfit/hairstyle/accessory 三字段的字符串)
- `generateStoryline` → import `storylineInstruction` 时多传 `attireHint/era/allowSelfie/allowModernProps`(从 `STORYLINE_TYPES.find(...)` 取);返回 `StorylineResult`

> `StorylineInput` 增加可选 nothing(类型仍由 storylineType 查 def 得到 era 等)。所有 `era`/`allowSelfie` 从 `typeDef` 取,不必加入 input。

- [ ] **Step 4: 跑测试 PASS + `pnpm lint`**

---

## Task 4: buildFramePromptFromBeat — selfie 真前置 + era 约束

**Files:** Modify `lib/scene/scene-plan.ts`;Test 改写 `tests/lib/scene/beat-prompt.test.ts`

- [ ] **Step 1: 改写/追加测试**

```ts
import { buildFramePromptFromBeat } from "@/lib/scene/scene-plan";
import type { StoryBeat, SceneContinuity } from "@/lib/scene/types";
const cont: SceneContinuity = { outfit:"x", accessory:"y", hairstyle:"h", jewelry:"j", shoes:"s", camera_style:"c", film_look:"f" };
const base: StoryBeat = { index:1, scene_title:"t", setting:"a castle gate", activity:"pushing the gate", shot_perspective:"selfie", shot_size:"medium", wardrobe:"main", expression_beat:"calm", is_highlight:false };

describe("buildFramePromptFromBeat v2", () => {
  it("selfie = 前置视角,明确看不到拿手机的手/无伸出手臂", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/do not see the hand|no arm reaching|front-camera/);
  });
  it("friend_candid 不拿手机", () => {
    const p = buildFramePromptFromBeat("x", { ...base, shot_perspective:"friend_candid" }, cont).toLowerCase();
    expect(p).toMatch(/not holding a phone|no phone/);
  });
  it("era=fantasy 注入禁现代道具/手机/运动鞋", () => {
    const p = buildFramePromptFromBeat("x", base, cont, { era:"fantasy", allowSelfie:false, allowModernProps:false }).toLowerCase();
    expect(p).toMatch(/no modern|no phone|period-accurate/);
  });
  it("全局 negative:恰两只手", () => {
    const p = buildFramePromptFromBeat("x", base, cont).toLowerCase();
    expect(p).toMatch(/exactly two hands|no third|no extra (arm|hand|limb)/);
  });
});
```

- [ ] **Step 2: 跑测试失败**

- [ ] **Step 3: 改 `buildFramePromptFromBeat`**(`lib/scene/scene-plan.ts`)

签名加可选 `constraints?: StorylineConstraints`(import)。`perspective` 改:
```ts
const perspective = beat.shot_perspective === "selfie"
  ? "shot as a front-camera selfie: the phone IS the camera, so you do NOT see the hand holding the phone and there is NO arm reaching toward the lens; just the subject's face/upper body with the scene behind"
  : "candidly photographed by a friend/bystander from a few meters away — the subject is NOT holding a phone and is not posing for a selfie, acting naturally in the scene";
```
末尾追加全局解剖 negative,以及 era 约束:
```ts
parts.push("anatomically correct: exactly two hands and two arms, no third arm/hand, no extra limbs, correct fingers");
if (constraints && constraints.era !== "modern") {
  parts.push(`period-accurate ${constraints.era} setting ONLY: absolutely NO modern phone, NO modern handbag, NO sneakers, NO selfie pose, NO modern objects`);
} else if (constraints && !constraints.allowModernProps) {
  parts.push("formal/professional setting: no casual crossbody bag");
}
```

- [ ] **Step 4: 跑测试 PASS + `pnpm lint`**

---

## Task 5: buildScenePlan 接 {attire,beats} + 质检收紧 + 回归

**Files:** Modify `lib/scene/services/scene-planner.ts`、`lib/scene/scene-plan.ts`(新增 `buildContinuityFromAttire`)、`lib/scene/services/quality-check.ts`;Test `tests/lib/scene/storyline-plan.test.ts`(更新)

- [ ] **Step 1: 更新测试**

```ts
// tests/lib/scene/storyline-plan.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/scene/config", () => ({ sceneConfig: { textModel: "t" }, hasTextProviderKey: () => false }));
import { buildScenePlan } from "@/lib/scene/services/scene-planner";

describe("buildScenePlan v2.1 (fallback)", () => {
  it("古代场景:6 帧不同 + 造型非现代 + 全 friend_candid", async () => {
    const plan = await buildScenePlan("穿越古代当将军", {}, 6);
    expect(plan.shots).toHaveLength(6);
    expect(new Set(plan.shots.map(s => s.summary)).size).toBe(6);
    // 古代:continuity.outfit 不应是现代毛衣;每帧 prompt 含 period/no modern
    expect(plan.continuity.outfit.toLowerCase()).not.toContain("sweater");
    for (const s of plan.shots) expect(s.image_prompt.toLowerCase()).toMatch(/period-accurate|no modern/);
  });
  it("现代旅程:正常出 6 帧不同场景", async () => {
    const plan = await buildScenePlan("豪华游轮看鲸鱼", { tone:"惊喜高光" }, 6);
    expect(new Set(plan.shots.map(s => s.summary)).size).toBe(6);
  });
});
```

- [ ] **Step 2: 跑测试失败**

- [ ] **Step 3: 新增 `buildContinuityFromAttire`**(`lib/scene/scene-plan.ts`)

```ts
import type { SceneAttire } from "./types";
// 把 LLM 产出的 type-appropriate attire 合成完整 SceneContinuity(补 jewelry/shoes/相机口径 + anchor)
export function buildContinuityFromAttire(attire: SceneAttire, safePrompt: string): SceneContinuity {
  const anchor = detectAnchorObject(safePrompt);
  return {
    outfit: attire.outfit,
    hairstyle: attire.hairstyle,
    accessory: attire.accessory,
    jewelry: "no extra jewelry beyond what the outfit implies",
    shoes: "footwear matching the outfit and era",
    camera_style: "iPhone main camera, auto HDR, 4:5 portrait, slight JPEG compression",
    film_look: "natural daylight, candid, visible skin texture, no studio lighting, no airbrushing",
    ...(anchor ? { anchor_object: anchor } : {}),
  };
}
```

- [ ] **Step 4: 改 `buildScenePlan`**(`lib/scene/services/scene-planner.ts`)

- `const { attire, beats } = await generateStoryline({...})`(返回结构变了)
- `const def = storylineDef(analysis.storyline_type)`;取 `const constraints = { era: def.era, allowSelfie: def.allowSelfie, allowModernProps: def.allowModernProps }`
- `const continuity = buildContinuityFromAttire(attire, safePrompt)`(取代旧 `buildFallbackContinuity`;后者仍保留作更深兜底,可不调用)
- 每帧:`image_prompt: buildFramePromptFromBeat(safePrompt, b, continuity, constraints)`
- import `buildContinuityFromAttire`

- [ ] **Step 5: 收紧质检 deformity**(`lib/scene/services/quality-check.ts`)

在 `QUALITY_PROMPT` 的 deformity 定义处追加一句:`A THIRD hand/arm, extra limbs, or a hand reaching from off-frame that doesn't belong counts as deformity=true.` 并在末尾强调:`If you see more than two hands/arms on the subject, set deformity=true.`

- [ ] **Step 6: 全量回归**

- `pnpm test tests/lib/scene tests/constants` — 全绿
- `pnpm test` — 全量全绿
- `pnpm lint` — 无报错
- 确认 `app/api/scene/plan/route.ts` 无需改(`buildScenePlan` 签名不变)

---

## Self-Review(已核对)

- **Spec 2.3 覆盖**:造型 LLM 化(Task 2/3/5)、era+约束标签(Task 1)、selfie 真前置(Task 4)、现代道具剔除(Task 4)、transformation 递进(attireHint + storylineInstruction 提及)、质检收紧 deformity(Task 5)。
- **Placeholder**:无;类型/常量/函数/测试均给完整代码或精确改点。
- **类型一致**:`SceneAttire`/`StorylineConstraints`/`Era`(Task 1)在 Task 2/3/4/5 一致;`generateStoryline` 返回 `StorylineResult{attire,beats}`(Task 3)被 `buildScenePlan`(Task 5)解构使用;`buildFramePromptFromBeat(safePrompt,beat,continuity,constraints?)` 签名前后一致。

## Execution Handoff

完成后用 subagent-driven-development 逐 Task 执行。
