# Plan B — 故事线前端问答 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/create` 的问答页从"3 题 vintage/film/光线"重写成"2 题 — 故事调性 + 体验侧重",对齐已完成的后端故事线引擎(Plan A/A2)。

**Architecture:**
- 后端 `analyzeInput` 已就绪,返回 `{storyline_type, tone_suggestions, focus_options}`;改 `/api/scene/clarify` 路由调用它(替换旧的 `classifyScene + generateClarifyingQuestions`)。
- 前端 `create/page.tsx` 把单页 `clarify` step 拆成 `tone` + `focus` 两个分屏 step,沿用现有的 amber/stone 暗房美术语言。
- 调性 Q1 = 8 个 emoji 卡片 2 列(mockup 方案 A) + AI 角标高亮 + 底部 Other 虚线框;侧重 Q2 = 4 个文本卡片 + 底部 Other。answers state 简化为只存 `{tone, focus, companion?}` 三个 key,直接 POST 给已就绪的 `buildScenePlan`。
- 国际化:调性 label/侧重 label 通过 next-intl 字典查;后端只回 `id`,UI 显示用 `t(\`scene.tones.${id}\`)` / `t(\`scene.focus.${storylineType}.${id}\`)`。

**Tech Stack:** Next.js 16 App Router + React 19、next-intl、Framer Motion、Tailwind、Vitest + Testing Library。仓库**非 git**,所有"Commit"步骤改为 `pnpm test && pnpm lint` 验证。

---

## 范围与不做的(YAGNI)

**做:**
- clarify API 路由改用 `analyzeInput`,返回 `storyline_type` / `tone_suggestions` / `focus_options`
- 前端 Step 流程:`upload → describe → tone → focus → generating → result`
- Q1 调性页 8 卡 + AI 推荐高亮
- Q2 侧重页 4 卡(选项数动态 = `focus_options.length`)
- Q1/Q2 都支持 Other 自由输入
- 国际化(中英)、单元测试、preview 实测

**不做(留给下次):**
- 第 3 题(节奏/视角)— spec 明确 2 题
- companion(陪伴修饰)显式问题 — MVP 通过用户原 prompt 自然带入即可
- "Other 文本驱动 AI 生成自定义调性"的后端支持 — UI 先允许输入,后端 `resolveToneId` 找不到匹配 id 时 fallback 到 AI 预选(用户感知到"有效果",只是不严格)。后续 backend 增强(向 `generateStoryline` 传 `customTonePrompt`)单独立项。
- 侧重选项 emoji 化(mockup 里的 emoji 是示意;留作下次视觉打磨)

---

## File Structure

**修改:**
- `app/api/scene/clarify/route.ts` — 用 `analyzeInput` 替换 `classifyScene + generateClarifyingQuestions`
- `app/[locale]/create/scene-api.ts` — `ClarifyResult` 类型契约更新
- `app/[locale]/create/page.tsx` — `Step` 类型 + `FLOW` 数组 + 整段 `clarify` 分支重写
- `messages/zh.json` — 新增 `scene.tones.*`、`scene.focus.*`、`scene.steps.tone`、`scene.steps.focus`、`scene.clarify` 新键
- `messages/en.json` — 同上对称

**新增:**
- `tests/lib/scene/clarify-route.test.ts` — 测 clarify route 集成 `analyzeInput` 后的返回字段

**不动:**
- `lib/scene/services/scene-planner.ts` — `analyzeInput` / `buildScenePlan` 已实现完毕
- `constants/scene-storylines.ts` — `SCENE_TONES`/`STORYLINE_TYPES` 已就绪
- `lib/scene/types.ts` — 类型已 export
- `/api/scene/plan` route — 已正确传 `answers` 给 `buildScenePlan`

---

## Task 1: clarify API 改用 analyzeInput

**Files:**
- Modify: `app/api/scene/clarify/route.ts`
- Modify: `app/[locale]/create/scene-api.ts`
- Create: `tests/lib/scene/clarify-route.test.ts`

- [ ] **Step 1.1: 写失败测试 — clarify route 应返回新字段**

新建 `tests/lib/scene/clarify-route.test.ts`:
```ts
// clarify route 集成:走 rewriteIntent + screenPrompt + analyzeInput 链路,
// 返回前端需要的 storyline_type/tone_suggestions/focus_options。
// 用 vi.mock 替换重写/审核/翻译,只验路由编排 + analyzeInput 真出。
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openrouter/chat", () => ({
  createOpenRouterChat: vi.fn().mockRejectedValue(new Error("no key in test")),
}));
vi.mock("@/lib/scene/config", () => ({
  sceneConfig: { textModel: "t", visionModel: "v" },
  hasTextProviderKey: () => false,
  shotCountForTier: () => 6,
}));
vi.mock("@/lib/scene/services/translation", () => ({
  normalizePromptForPlanning: vi.fn(async (raw: string) => ({
    workingPrompt: raw,
    originalLanguage: "en",
    wasTranslated: false,
  })),
}));
vi.mock("@/lib/scene/services/intent-rewriter", () => ({
  rewriteIntent: vi.fn(async ({ rawPrompt }: { rawPrompt: string }) => ({
    safePrompt: rawPrompt,
    rewriteApplied: false,
    rewriteReason: "none",
    userNotice: null,
  })),
}));
vi.mock("@/lib/scene/services/prompt-moderation", () => ({
  screenPrompt: vi.fn(async () => ({ decision: "allow", action: "allow" })),
  isBlocked: () => false,
}));

import { POST } from "@/app/api/scene/clarify/route";

function mkReq(body: unknown) {
  return new Request("http://localhost/api/scene/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("/api/scene/clarify (Plan B contract)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ownership_flex 输入 → 返回 storyline_type + tone_suggestions + focus_options", async () => {
    const res = await POST(mkReq({ rawPrompt: "我买了一架私人直升机" }));
    const data = await res.json();
    expect(data.safePrompt).toBe("我买了一架私人直升机");
    expect(data.storyline_type).toBe("ownership_flex");
    expect(Array.isArray(data.tone_suggestions)).toBe(true);
    expect(data.tone_suggestions.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.focus_options)).toBe(true);
    expect(data.focus_options.length).toBeGreaterThanOrEqual(3);
    // 旧契约的 questions/classification 不再返回(或为空)
    expect(data.questions).toBeUndefined();
  });

  it("journey 兜底 → 仍返回三段载荷", async () => {
    const res = await POST(mkReq({ rawPrompt: "去三亚旅行" }));
    const data = await res.json();
    expect(data.storyline_type).toBe("journey");
    expect(data.tone_suggestions.length).toBeGreaterThanOrEqual(1);
    expect(data.focus_options.length).toBeGreaterThanOrEqual(3);
  });

  it("缺 rawPrompt → 400", async () => {
    const res = await POST(mkReq({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 1.2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/clarify-route.test.ts`
Expected: 三个用例均 FAIL — 因为当前 route 返回 `questions/classification` 而非 `storyline_type` 等。

- [ ] **Step 1.3: 改 clarify route 调用 analyzeInput**

完整替换 `app/api/scene/clarify/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { rewriteIntent, screenPrompt, isBlocked, analyzeInput } from "@/lib/scene/services";
import { normalizePromptForPlanning } from "@/lib/scene/services/translation";
import { getErrorMessage } from "@/lib/error-utils";

// 固定顺序:raw → IntentRewriter → safe → PromptModeration → analyzeInput(Plan B)。
// 纯分析,不创建 job、不扣 credits;首组免费、不强制注册。
// Plan B:用 analyzeInput 取代旧的 classifyScene+generateClarifyingQuestions,
// 返回 storyline_type / tone_suggestions / focus_options 驱动 2 题问答。
const SAFE_CHIPS = [
  "Luxury car editorial scene",
  "Cinematic first-class inspired travel set",
  "Dream CEO-style office portrait set",
];

export async function POST(req: NextRequest) {
  try {
    const { rawPrompt } = (await req.json()) as { rawPrompt?: string };
    if (!rawPrompt || typeof rawPrompt !== "string" || rawPrompt.trim().length < 2) {
      return NextResponse.json({ error: "Please describe a scene." }, { status: 400 });
    }

    const normalized = await normalizePromptForPlanning(rawPrompt.trim());
    const workingPrompt = normalized.workingPrompt;

    const rewrite = await rewriteIntent({ rawPrompt: workingPrompt });
    if (rewrite.rewriteReason === "blocked") {
      const mod = await screenPrompt({ safePrompt: rawPrompt });
      return NextResponse.json(
        {
          rejected: {
            reason: mod.reason ?? "unknown",
            userMessage: mod.userMessage || rewrite.userNotice || "This scene needs a quick rewrite.",
            safeRewriteChips: SAFE_CHIPS,
          },
        },
        { status: 200 },
      );
    }

    const moderation = await screenPrompt({ safePrompt: rewrite.safePrompt, rawPrompt });
    if (isBlocked(moderation)) {
      return NextResponse.json(
        {
          rejected: {
            reason: moderation.reason ?? "unknown",
            userMessage: moderation.userMessage,
            safeRewriteChips: SAFE_CHIPS,
          },
        },
        { status: 200 },
      );
    }

    const analysis = await analyzeInput(rewrite.safePrompt);

    return NextResponse.json({
      safePrompt: rewrite.safePrompt,
      rewriteApplied: rewrite.rewriteApplied,
      rewriteReason: rewrite.rewriteReason,
      userNotice: rewrite.userNotice,
      // Plan B 新契约:替代 classification/questions
      storyline_type: analysis.storyline_type,
      tone_suggestions: analysis.tone_suggestions,
      focus_options: analysis.focus_options,
      // 多语言:前端据此显示"已自动翻译为英文"提示
      originalLanguage: normalized.originalLanguage,
      wasTranslated: normalized.wasTranslated,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, "Could not analyze this scene.") }, { status: 500 });
  }
}
```

确认 `lib/scene/services/index.ts` 已 export `analyzeInput`(应是 Plan A 已加过)。若未 export,先在 services barrel 加 export。

- [ ] **Step 1.4: 验证 services 已 export analyzeInput**

Run: `grep -n analyzeInput /Volumes/FZD/开发项目/Sceneself/lib/scene/services/index.ts`
Expected: 至少一行命中 `export ... analyzeInput`。若无 → 在文件末尾加 `export { analyzeInput } from "./scene-planner";`。

- [ ] **Step 1.5: 改 ClarifyResult 类型契约**

完整替换 `app/[locale]/create/scene-api.ts` 中 `ClarifyResult` 接口(其他不动):
```ts
export interface ClarifyResult {
  safePrompt?: string;
  rewriteApplied?: boolean;
  rewriteReason?: RewriteReason;
  userNotice?: string;
  /** Plan B:用户输入归到的故事线类型(8 类之一) */
  storyline_type?: StorylineType;
  /** AI 预选高亮的调性 id(1-2 个,匹配 SCENE_TONES) */
  tone_suggestions?: string[];
  /** Q2 体验侧重选项(该故事线类型专属,后端常量驱动) */
  focus_options?: { id: string; label: string }[];
  rejected?: { reason: string; userMessage: string; safeRewriteChips: string[] };
  error?: string;
  /** 用户输入的原始语言("en" 表示无翻译;非 en 时可能附带 wasTranslated) */
  originalLanguage?: "en" | "zh" | "ja" | "ko" | "other";
  /** 是否真正发生了翻译(用于前端展示"已自动翻译"提示) */
  wasTranslated?: boolean;
}
```

同时:
1. 删除 `import` 里不再用的 `ClarifyingQuestion`、`SceneClassification`。
2. 加 import `StorylineType`:
```ts
import type { ScenePlan, RewriteReason, StorylineType } from "@/lib/scene/types";
```

- [ ] **Step 1.6: 跑测试确认通过**

Run: `pnpm test tests/lib/scene/clarify-route.test.ts`
Expected: 3 PASS。

- [ ] **Step 1.7: 跑全量保证未破坏其它测试**

Run: `pnpm test`
Expected: 258 全绿(或 261 — 新增的 3 个)。

注意:`page.tsx` 现在引用旧的 `clarify.questions` 会编译失败/类型报错。先忽略,Task 3 会重写。

- [ ] **Step 1.8: 验证(替代 commit)**

仓库非 git。验证步骤:
Run: `pnpm test tests/lib/scene/clarify-route.test.ts && pnpm test tests/lib/scene/analyze-input.test.ts`
Expected: 全 PASS,确认 clarify route 改造未回归 analyzeInput。

---

## Task 2: i18n 文案 — 调性 + 侧重 + 新 Step 标签

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

- [ ] **Step 2.1: zh.json 新增调性字典**

在 `messages/zh.json` 的 `scene` namespace 下,`clarify` 与 `generating` 之间插入:
```json
"tones": {
  "narrative_doc": { "label": "叙事纪实", "hint": "像真实 vlog 的纪录片质感" },
  "surprise_highlight": { "label": "惊喜高光", "hint": "突出难忘的高潮瞬间" },
  "healing_chill": { "label": "松弛治愈", "hint": "慢节奏、温暖、享受当下" },
  "cinematic_drama": { "label": "电影戏剧", "hint": "电影感张力与故事高潮" },
  "versailles_flex": { "label": "凡尔赛炫耀", "hint": "低调奢华的上流生活" },
  "funny_meme": { "label": "搞笑沙雕", "hint": "轻松好笑、可玩梗" },
  "romantic": { "label": "浪漫氛围", "hint": "柔光浪漫梦境感" },
  "epic_blood": { "label": "燃系热血", "hint": "高能、英雄、肾上腺素" }
},
```

- [ ] **Step 2.2: zh.json 新增侧重字典**

继续插入(`tones` 之后):
```json
"focus": {
  "ownership_flex": {
    "luxury": "极致豪华",
    "lifestyle": "上流生活方式",
    "social": "社交名利场",
    "detail": "质感细节"
  },
  "fantasy_role": {
    "world": "世界观沉浸",
    "charisma": "角色魅力",
    "epic": "史诗大场面",
    "aesthetic": "唯美意境"
  },
  "milestone_event": {
    "peak": "高光时刻",
    "prep": "幕后准备",
    "celebrate": "欢庆",
    "emotion": "情感"
  },
  "profession": {
    "authority": "专业权威",
    "warm": "亲和温度",
    "backstage": "幕后真实",
    "peak": "高光时刻"
  },
  "transformation": {
    "before_after": "前后对比",
    "process": "过程记录",
    "result": "成果绽放"
  },
  "seasonal": {
    "festive": "节日氛围",
    "cozy": "温馨治愈",
    "scenery": "季节风景",
    "party": "欢聚"
  },
  "lifestyle": {
    "calm": "松弛日常",
    "active": "活力运动",
    "home": "居家温度",
    "taste": "品味格调"
  },
  "journey": {
    "scenery": "风景人文",
    "food": "美食",
    "shopping": "购物",
    "leisure": "悠闲放空"
  }
},
```

- [ ] **Step 2.3: zh.json 改 `steps` + `clarify` 文案**

把 `scene.steps` 改成(增 tone/focus,保留 upload/describe 兼容用):
```json
"steps": {
  "upload": "自拍",
  "describe": "场景",
  "tone": "调性",
  "focus": "侧重",
  "clarify": "细节",
  "review": "预览"
},
```

把 `scene.clarify` 整段替换为(老 `title/subtitle/other/otherPlaceholder/rewriteNotice/translatedNotice/rejectedTitle/rejectedBody` 保留,新增 Q1/Q2 专属文案):
```json
"clarify": {
  "tone": {
    "title": "想要什么感觉?",
    "subtitle": "选一个调性 — AI 已为你高亮 1-2 个最匹配的。",
    "aiHint": "⭐ AI 已为你高亮",
    "aiBadge": "AI",
    "next": "下一步"
  },
  "focus": {
    "title": "最想突出什么?",
    "subtitle": "据你的描述定制 — 选一个体验侧重。"
  },
  "other": "其他",
  "otherPlaceholder": "自己写一个…",
  "rewriteNotice": "已作为创意 editorial 场景生成。",
  "translatedNotice": "已自动翻译为英文以获得最佳生成效果。",
  "rejectedTitle": "这个场景需要稍作调整",
  "rejectedBody": "我们无法按原样生成 — 它可能被理解为真实经历声明或敏感内容。换一个试试:",
  "start": "生成我的故事"
},
```

- [ ] **Step 2.4: en.json 对称新增**

把上述 `tones` / `focus` / `steps` / `clarify` 三段在 `messages/en.json` 的 `scene` namespace 下做英文对称:

```json
"tones": {
  "narrative_doc": { "label": "Documentary", "hint": "Plain candid record, like real vlog stills" },
  "surprise_highlight": { "label": "Surprise Highlight", "hint": "Unexpected, memorable peak moments" },
  "healing_chill": { "label": "Calm & Cozy", "hint": "Slow, warm, savor-the-moment mood" },
  "cinematic_drama": { "label": "Cinematic", "hint": "Filmic tension and story climax" },
  "versailles_flex": { "label": "Quiet Flex", "hint": "Understated luxury, upper-class life" },
  "funny_meme": { "label": "Playful Meme", "hint": "Light, funny, meme-able energy" },
  "romantic": { "label": "Romantic", "hint": "Soft, dreamy, romantic atmosphere" },
  "epic_blood": { "label": "Epic Energy", "hint": "High-energy, heroic, adrenaline" }
},
"focus": {
  "ownership_flex": {
    "luxury": "Pure luxury",
    "lifestyle": "Upper-class lifestyle",
    "social": "Social scene",
    "detail": "Tactile detail"
  },
  "fantasy_role": {
    "world": "World immersion",
    "charisma": "Character charisma",
    "epic": "Epic spectacle",
    "aesthetic": "Aesthetic mood"
  },
  "milestone_event": {
    "peak": "Peak moment",
    "prep": "Backstage prep",
    "celebrate": "Celebration",
    "emotion": "Emotion"
  },
  "profession": {
    "authority": "Authority",
    "warm": "Warmth",
    "backstage": "Backstage real",
    "peak": "Peak moment"
  },
  "transformation": {
    "before_after": "Before / after",
    "process": "The process",
    "result": "The result"
  },
  "seasonal": {
    "festive": "Festive mood",
    "cozy": "Cozy warmth",
    "scenery": "Seasonal scenery",
    "party": "Gathering"
  },
  "lifestyle": {
    "calm": "Calm everyday",
    "active": "Active energy",
    "home": "Cozy home",
    "taste": "Refined taste"
  },
  "journey": {
    "scenery": "Scenery & culture",
    "food": "Food",
    "shopping": "Shopping",
    "leisure": "Leisure"
  }
},
"steps": {
  "upload": "Selfie",
  "describe": "Scene",
  "tone": "Tone",
  "focus": "Focus",
  "clarify": "Details",
  "review": "Preview"
},
"clarify": {
  "tone": {
    "title": "What feeling do you want?",
    "subtitle": "Pick a tone — AI highlighted 1-2 that best fit.",
    "aiHint": "⭐ AI highlighted for you",
    "aiBadge": "AI",
    "next": "Next"
  },
  "focus": {
    "title": "What should the set lean into?",
    "subtitle": "Tailored to your scene — pick one focus."
  },
  "other": "Other",
  "otherPlaceholder": "Describe your own…",
  "rewriteNotice": "Generated as a creative editorial scene.",
  "translatedNotice": "Auto-translated to English for best generation.",
  "rejectedTitle": "This scene needs a small tweak",
  "rejectedBody": "We couldn't generate it as-is — it might be read as a real claim or sensitive content. Try one of these:",
  "start": "Generate my story"
},
```

- [ ] **Step 2.5: 跑测试 + lint 验证 JSON 合法**

Run: `pnpm lint`
Expected: 无 JSON 解析错误、无新增 lint 报错(page.tsx 仍可能引用 t("clarify.title") 这类不存在 key,但 lint 不会捕;Task 3 解决)。

如果 JSON 有错,vitest 也会爆。Run: `pnpm test --run`
Expected: 全 PASS(不依赖新 i18n key 的测试)。

- [ ] **Step 2.6: 验证(替代 commit)**

确认两份 messages JSON 都能被 Node JSON.parse:
Run: `node -e "JSON.parse(require('fs').readFileSync('/Volumes/FZD/开发项目/Sceneself/messages/zh.json'));JSON.parse(require('fs').readFileSync('/Volumes/FZD/开发项目/Sceneself/messages/en.json'));console.log('ok')"`
Expected: 输出 `ok`。

---

## Task 3: 前端 UI 重写 — 2 题分屏 + 调性/侧重卡片

整段重写 `app/[locale]/create/page.tsx` 的 `clarify` 分支为两个独立 step(`tone`/`focus`),`answers` state 重构为 `{tone, focus, companion?}` 三键 Record,`FLOW` 与进度条改成 4 段。

**Files:**
- Modify: `app/[locale]/create/page.tsx`

- [ ] **Step 3.1: 改 Step 类型与 FLOW 数组**

把 `app/[locale]/create/page.tsx` 的:
```ts
type Step = "upload" | "describe" | "clarify" | "generating" | "result";
const FLOW: Step[] = ["upload", "describe", "clarify"];
```
改成:
```ts
// Plan B:clarify 拆成 tone + focus 两个分屏,沿用同一 question state,
// 进度条 4 段反映 upload→describe→Q1→Q2。
type Step = "upload" | "describe" | "tone" | "focus" | "generating" | "result";
const FLOW: Step[] = ["upload", "describe", "tone", "focus"];
```

- [ ] **Step 3.2: 新增 SCENE_TONES 常量导入**

在 page.tsx 顶部 import 区:
```ts
import { SCENE_TONES } from "@/constants/scene-storylines";
```

(不引入 STORYLINE_TYPES — focus_options 完全走后端返回 + i18n 字典,避免前端再硬编码。)

- [ ] **Step 3.3: 把 submitDescribe 跳转改为 'tone'**

定位现有 `submitDescribe` 末尾的 `setStep("clarify")`,改成 `setStep("tone")`。

```ts
const submitDescribe = useCallback(async () => {
  if (!rawPrompt.trim()) return;
  setBusy(true);
  setError(null);
  try {
    const r = await api.clarifyScene(rawPrompt.trim());
    setClarify(r);
    setAnswers({});
    setOtherOpen({});
    setStep("tone"); // Plan B:进 Q1 调性
  } catch {
    setError(t("errors.generic"));
  } finally {
    setBusy(false);
  }
}, [rawPrompt, t]);
```

- [ ] **Step 3.4: 简化 questionsAnswered 校验**

定位:
```ts
const questionsAnswered =
  !!clarify?.questions && clarify.questions.every(q => (answers[q.id] ?? "").trim().length > 0);
```
完整替换为(分别 expose 两题的就绪态,UI 各自用):
```ts
// Plan B:answers 只存 {tone, focus} 两键(companion 留作 future);
// otherOpen[key]=true 表示用户在写 Other 文本,此时 answers[key] 是自由文本(可为空 → 未填)。
const toneAnswered = (answers.tone ?? "").trim().length > 0;
const focusAnswered = (answers.focus ?? "").trim().length > 0;
```

- [ ] **Step 3.5: 改 submitClarify 的 step 名称(归一到 focus)**

`submitClarify` 内仍然只读 `answers` + `clarify.safePrompt`,无需改逻辑;但 `backToClarifyFromGenerating` 现在应当回到最近编辑的 `focus` 屏:

```ts
const backToClarifyFromGenerating = useCallback(() => {
  setSetupError(null);
  setStep("focus"); // Plan B:从 generating 回退到 Q2(末题)
}, []);
```

- [ ] **Step 3.6: 删除老 'clarify' 分支整段 + 加新 'tone' 分支**

定位 `{step === "clarify" && (` 起始的整个 `<motion.section>`(包括 rejected 分支)。
**保留 rejected 分支**(它独立于 2 题问答,只用于 moderation 拒绝场景),但要让它在新 step `tone` 下渲染(因为 rejected 时不可能进 focus)。

替换为两个独立 motion.section:

```tsx
{/* ── Q1 TONE(rejected 兜底也走这屏)── */}
{step === "tone" && (
  <motion.section key="tone" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-1 flex-col">
    <BackButton onClick={() => setStep("describe")} />

    {clarify?.rejected ? (
      <div className="mt-4">
        <h1 className={`${display.className} text-[1.9rem] font-medium leading-tight text-stone-50`}>{t("clarify.rejectedTitle")}</h1>
        <p className="mt-3 text-sm text-stone-400">{t("clarify.rejectedBody")}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          {clarify.rejected.safeRewriteChips.map(chip => (
            <button key={chip} type="button" onClick={() => { setRawPrompt(chip); setStep("describe"); }} className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3.5 text-left text-sm text-amber-100 transition hover:bg-amber-300/[0.12]">
              {chip}
            </button>
          ))}
        </div>
      </div>
    ) : (
      <ToneStep
        t={t}
        displayClass={display.className}
        suggestions={clarify?.tone_suggestions ?? []}
        selected={answers.tone}
        otherOpen={!!otherOpen.tone}
        wasTranslated={!!clarify?.wasTranslated}
        rewriteApplied={!!clarify?.rewriteApplied}
        onPick={(toneId) => { setOtherOpen(o => ({ ...o, tone: false })); setAnswers(a => ({ ...a, tone: toneId })); }}
        onPickOther={() => { setOtherOpen(o => ({ ...o, tone: true })); setAnswers(a => ({ ...a, tone: "" })); }}
        onOtherText={(v) => setAnswers(a => ({ ...a, tone: v }))}
        onNext={() => setStep("focus")}
        canNext={toneAnswered}
      />
    )}
  </motion.section>
)}

{/* ── Q2 FOCUS ── */}
{step === "focus" && (
  <motion.section key="focus" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-1 flex-col">
    <BackButton onClick={() => setStep("tone")} />
    <FocusStep
      t={t}
      displayClass={display.className}
      storylineType={clarify?.storyline_type ?? "journey"}
      options={clarify?.focus_options ?? []}
      selected={answers.focus}
      otherOpen={!!otherOpen.focus}
      onPick={(focusId) => { setOtherOpen(o => ({ ...o, focus: false })); setAnswers(a => ({ ...a, focus: focusId })); }}
      onPickOther={() => { setOtherOpen(o => ({ ...o, focus: true })); setAnswers(a => ({ ...a, focus: "" })); }}
      onOtherText={(v) => setAnswers(a => ({ ...a, focus: v }))}
      onSubmit={submitClarify}
      canSubmit={toneAnswered && focusAnswered}
      error={error}
    />
  </motion.section>
)}
```

- [ ] **Step 3.7: 在 page.tsx 底部新增 ToneStep 组件**

紧挨现有 `BackButton` / `ErrorLine` 定义旁边新增:

```tsx
function ToneStep({
  t,
  displayClass,
  suggestions,
  selected,
  otherOpen,
  wasTranslated,
  rewriteApplied,
  onPick,
  onPickOther,
  onOtherText,
  onNext,
  canNext,
}: {
  t: ReturnType<typeof useTranslations>;
  displayClass: string;
  suggestions: string[];
  selected: string | undefined;
  otherOpen: boolean;
  wasTranslated: boolean;
  rewriteApplied: boolean;
  onPick: (toneId: string) => void;
  onPickOther: () => void;
  onOtherText: (v: string) => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <>
      <h1 className={`${displayClass} mt-4 text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>
        {t("clarify.tone.title")}
      </h1>
      <p className="mt-3 text-sm text-stone-400">{t("clarify.tone.subtitle")}</p>
      {wasTranslated && (
        <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3.5 py-2.5 text-xs text-amber-200/90">
          {t("clarify.translatedNotice")}
        </p>
      )}
      {rewriteApplied && (
        <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3.5 py-2.5 text-xs text-amber-200/90">
          {t("clarify.rewriteNotice")}
        </p>
      )}
      {suggestions.length > 0 && (
        <p className="mt-5 text-xs uppercase tracking-[0.15em] text-amber-300/80">
          {t("clarify.tone.aiHint")}
        </p>
      )}

      {/* 8 个调性 2 列卡片(方案 A) */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {SCENE_TONES.map(tone => {
          const isSuggested = suggestions.includes(tone.id);
          const isActive = !otherOpen && selected === tone.id;
          const ring = isActive
            ? "border-amber-300 bg-amber-300/15 text-amber-100"
            : isSuggested
              ? "border-amber-300/60 bg-amber-300/[0.08] text-amber-100"
              : "border-white/10 bg-white/[0.02] text-stone-200 hover:border-white/25";
          return (
            <button
              key={tone.id}
              type="button"
              onClick={() => onPick(tone.id)}
              className={`relative flex flex-col items-start gap-1.5 rounded-2xl border px-3 py-3 text-left transition ${ring}`}
            >
              {isSuggested && (
                <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-stone-900">
                  {t("clarify.tone.aiBadge")}
                </span>
              )}
              <span className="text-[22px] leading-none">{tone.emoji}</span>
              <span className="text-[13px] font-semibold leading-tight">{t(`tones.${tone.id}.label`)}</span>
              <span className="text-[11px] leading-tight text-stone-400">{t(`tones.${tone.id}.hint`)}</span>
            </button>
          );
        })}
      </div>

      {/* Other 兜底 */}
      <button
        type="button"
        onClick={onPickOther}
        className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed px-3.5 py-3 text-sm transition ${
          otherOpen ? "border-amber-300/60 bg-amber-300/[0.06] text-amber-100" : "border-white/15 bg-transparent text-stone-400 hover:border-white/30"
        }`}
      >
        <Pencil className="h-3.5 w-3.5" /> {t("clarify.other")}
      </button>
      {otherOpen && (
        <input
          autoFocus
          value={selected ?? ""}
          onChange={e => onOtherText(e.target.value)}
          placeholder={t("clarify.otherPlaceholder")}
          className="mt-2.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-300/30 focus:ring-2 focus:ring-amber-300/20 placeholder:text-stone-600"
        />
      )}

      <div className="mt-auto pt-6">
        <PrimaryButton disabled={!canNext} onClick={onNext}>
          {t("clarify.tone.next")} <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </>
  );
}
```

- [ ] **Step 3.8: 新增 FocusStep 组件**

紧挨 ToneStep 后:

```tsx
function FocusStep({
  t,
  displayClass,
  storylineType,
  options,
  selected,
  otherOpen,
  onPick,
  onPickOther,
  onOtherText,
  onSubmit,
  canSubmit,
  error,
}: {
  t: ReturnType<typeof useTranslations>;
  displayClass: string;
  storylineType: string;
  options: { id: string; label: string }[];
  selected: string | undefined;
  otherOpen: boolean;
  onPick: (focusId: string) => void;
  onPickOther: () => void;
  onOtherText: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  error: string | null;
}) {
  // 侧重 label 走 i18n 查;若 i18n 缺 key,t() 默认返回 key,这里 fallback 用 backend 的 label。
  const labelFor = (id: string, backendLabel: string) => {
    const key = `clarify.focus.${storylineType}.${id}`;
    const v = t(key);
    // next-intl 缺 key 时返回 key 字符串本身;以此判别 fallback。
    return v && v !== key ? v : backendLabel;
  };

  return (
    <>
      <h1 className={`${displayClass} mt-4 text-[2.1rem] font-medium leading-[1.05] text-stone-50`}>
        {t("clarify.focus.title")}
      </h1>
      <p className="mt-3 text-sm text-stone-400">{t("clarify.focus.subtitle")}</p>

      {/* 4 卡 2 列(若 3 项 → 自然换行) */}
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {options.map(opt => {
          const active = !otherOpen && selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onPick(opt.id)}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3.5 py-4 text-left transition ${
                active
                  ? "border-amber-300 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-white/[0.02] text-stone-200 hover:border-white/25"
              }`}
            >
              <span className="text-sm font-semibold leading-tight">{labelFor(opt.id, opt.label)}</span>
            </button>
          );
        })}
      </div>

      {/* Other 兜底 */}
      <button
        type="button"
        onClick={onPickOther}
        className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed px-3.5 py-3 text-sm transition ${
          otherOpen ? "border-amber-300/60 bg-amber-300/[0.06] text-amber-100" : "border-white/15 bg-transparent text-stone-400 hover:border-white/30"
        }`}
      >
        <Pencil className="h-3.5 w-3.5" /> {t("clarify.other")}
      </button>
      {otherOpen && (
        <input
          autoFocus
          value={selected ?? ""}
          onChange={e => onOtherText(e.target.value)}
          placeholder={t("clarify.otherPlaceholder")}
          className="mt-2.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-300/30 focus:ring-2 focus:ring-amber-300/20 placeholder:text-stone-600"
        />
      )}

      {error && <ErrorLine text={error} />}

      <div className="mt-auto pt-6">
        <PrimaryButton disabled={!canSubmit} onClick={onSubmit}>
          <Sparkles className="h-4 w-4" /> {t("clarify.start")}
        </PrimaryButton>
      </div>
    </>
  );
}
```

- [ ] **Step 3.9: header 进度标签兜底**

定位 `<span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{t(\`steps.${FLOW[Math.max(0, stepIndex)]}\`)}</span>`。

无需改 — FLOW 现在是 4 段且 `scene.steps.tone` / `scene.steps.focus` 已加(Task 2)。

但 `stepIndex` 计算依赖 `FLOW.indexOf(step)`,当 step 是 `generating`/`result` 时返回 -1,现有 `Math.max(0, stepIndex)` 兜底正确。Header 中 `{step !== "generating" && step !== "result" && (...)}` 在新 step `tone`/`focus` 也显示标签 — 这是想要的行为。无须改动。

- [ ] **Step 3.10: 跑 lint 验证无 type 错误**

Run: `pnpm lint`
Expected: 无报错。常见漏:
- `clarify.questions` 引用残留 → 全文 grep 确认已删
- `t("clarify.title")` / `t("clarify.subtitle")` 引用残留 → 改为 `t("clarify.tone.title")` 或在 ToneStep 内
- import 的 `Pencil` / `Sparkles` / `ArrowRight` 仍要保留(被新组件用到)

Run 兜底:
```bash
grep -n "clarify\.questions\|clarify\.title\b\|clarify\.subtitle\b" /Volumes/FZD/开发项目/Sceneself/app/[locale]/create/page.tsx
```
Expected: 空(若有命中 → 修)。

- [ ] **Step 3.11: 跑全量测试确认无回归**

Run: `pnpm test`
Expected: 全 PASS(应该 261 个,包含 Task 1 的 3 个新增)。

- [ ] **Step 3.12: 验证(替代 commit)**

Run: `pnpm lint && pnpm test`
Expected: 全绿。

---

## Task 4: 真机 preview 实测验证整流程

**Files:** (read-only verification — 仅启 dev server + 浏览器交互)

- [ ] **Step 4.1: 启 dev server(或重启)**

按交接的踩坑提醒:改 server 代码后 hot-reload 不可靠。先停旧实例再启。

Run: `pnpm dev:turbopack`(或通过 preview_start 启)
等待 `Ready in` 提示。

- [ ] **Step 4.2: 浏览器打开 /zh/create 验证 Q1 调性页**

Steps(用 preview_* 或手动):
1. 登录(若需)
2. 上传任意自拍 → 进 describe 屏
3. 输入"豪华游轮看鲸鱼" → 提交
4. **预期 Q1 屏出现**:
   - 标题"想要什么感觉?"
   - `⭐ AI 已为你高亮` 提示
   - 8 个 emoji 卡片 2 列布局
   - "惊喜高光" + "松弛治愈"(journey 的 toneBias 是 narrative_doc/healing_chill,所以实际应高亮"叙事纪实" / "松弛治愈")**带「AI」角标 + 金色边框**
   - 底部"✏️ 其他"虚线框
5. 点击任意调性卡片 → 卡片高亮变 active 态(更亮)
6. 点"下一步 →" 进 Q2

- [ ] **Step 4.3: 验证 Q2 侧重页**

预期:
- 标题"最想突出什么?"
- 4 张文字卡片 2 列:"风景人文 / 美食 / 购物 / 悠闲放空"(journey 类的 focusOptions)
- 底部"其他"虚线框
- 选一项 → 高亮
- 末按钮"生成我的故事 →"(原"开始生成")

点末按钮 → 进 generating 屏(不变,沿用原显影动画)。

- [ ] **Step 4.4: 验证英文站(/en/create)**

切到英文路由(默认无 prefix,实际可能是 `/create`):
- Q1 标题应是 "What feeling do you want?"
- 调性 label 是 "Documentary / Surprise Highlight / Calm & Cozy..."
- Q2 标题 "What should the set lean into?"
- 末按钮 "Generate my story"

- [ ] **Step 4.5: 验证后端确实接到了 tone/focus id**

实测一个 journey 输入,完成 Q1/Q2 选择后,在 dev server 日志或 Network 看 `/api/scene/plan` 请求体的 `answers`:
```json
{ "tone": "narrative_doc", "focus": "scenery" }
```
(具体值看用户选什么)

后端 `buildScenePlan` 应解析到这两个 id 进 `generateStoryline`。

可选:在 preview 里 curl 验证:
```bash
curl -sS -X POST http://localhost:3000/api/scene/plan \
  -H "Content-Type: application/json" \
  -d '{"safePrompt":"豪华游轮看鲸鱼","answers":{"tone":"surprise_highlight","focus":"scenery"}}'
```
Expected: 返回 scenePlan,`shots[0].image_prompt` 含"惊喜高光"调性的 promptFragment(英文 "emphasize unexpected, delightful, memorable peak moments")。

- [ ] **Step 4.6: 验证 Other 调性的兜底行为**

回 Q1 → 点"其他" → 输入"复古港风" → 下一步 → 选 Q2 → 提交。
预期:后端 `resolveToneId` 找不到匹配 → fallback 到 AI 预选第一个 → 不报错,流程能走通(用户感知到不是严格的"复古港风"调,但不阻塞)。
(后端真支持 freeform tone 是后续任务,见本 plan 范围)

- [ ] **Step 4.7: 验证 rejected 兜底分支**

输入一个会被 moderation 拒的 prompt(如 "私人飞机里裸体"),应:
- 不进 Q1
- step 进 tone 但显示"这个场景需要稍作调整" + safeRewriteChips
- 点 chip → 回 describe 屏并预填

- [ ] **Step 4.8: 验证进度条 4 段**

每屏顶部进度条应有 4 个小格:upload→describe→tone→focus,当前所在 step 之前的格金色,之后灰色。

- [ ] **Step 4.9: 最终全套验证**

Run:
```bash
pnpm lint && pnpm test
```
Expected: 全绿。

Run(后端实测,不出图、不扣积分):
```bash
curl -sS -X POST http://localhost:3000/api/scene/clarify \
  -H "Content-Type: application/json" \
  -d '{"rawPrompt":"豪华游轮看鲸鱼"}' | head -50
```
Expected: 响应含 `storyline_type:"journey"`、`tone_suggestions:["narrative_doc","healing_chill"]`、`focus_options:[{id:"scenery",...},{id:"food",...},{id:"shopping",...},{id:"leisure",...}]`。

- [ ] **Step 4.10: 截图归档**

在 superpowers/screenshots 留两张:Q1 调性页 + Q2 侧重页,以便下次会话对照。
(可选 — 取决于 preview 工具可用性。)

---

## Self-Review Checklist

**1. Spec 覆盖**

- ✅ spec 3.1 砍 vintage/film 风格问 → Task 1 改 route + Task 3 全量删 `clarify.questions` 渲染
- ✅ spec 3.2 AI 预选 + 8 精选 + Other → Task 3.7 ToneStep 完整实现
- ✅ spec 3.3 方案 A 全平铺 2 列 + 一屏一问 + 进度条 + 末按钮"生成我的故事" → Task 3.1 FLOW=4段、Task 3.7/3.8 两屏组件、Task 2 文案"生成我的故事"
- ✅ Q2 体验侧重据输入动态生成 → Task 1 route 回 `focus_options` + Task 3.8 FocusStep 渲染
- ✅ companion 不做 → 范围与不做章节已注明
- ✅ 调性 8 个完整列表 → Task 3.7 用 `SCENE_TONES`(constants 里 8 个齐全)
- ✅ Other 自由输入 → Task 3.7/3.8 都有 Other 虚线框 + input

**2. 占位符扫描**

- 没有 "TBD" / "TODO" / "类似 Task N";所有 step 都有具体代码块。
- "Add appropriate error handling" — 无。错误处理沿用现有 `error` state + `<ErrorLine>` 组件,Task 3.8 显式传 error prop。

**3. 类型一致性**

- `ClarifyResult` 新字段:`storyline_type / tone_suggestions / focus_options` — 在 Task 1.5 定义、Task 3.6/3.7/3.8 全部按这三个名引用。
- `StorylineType` 类型 — Task 1.5 import 自 `@/lib/scene/types`(已 export,行 108)。
- `answers` 三键 `tone/focus/companion` — Task 3.4 校验、Task 3.6 写入、未来后端 `buildScenePlan` 已支持(scene-planner.ts:140-145)。
- 组件 props:ToneStep / FocusStep 的 `onPick(id: string)` 签名一致;state 写入用同一个 `answers[k]` 模式。

**4. 关键风险与已规避**

- "改 server 代码 hot-reload 不可靠" → Task 4.1 强制重启
- JSON 大小写 / 逗号 → Task 2.5/2.6 用 `node -e JSON.parse` 验证
- `t()` 缺 key 时返回 key 字符串 → Task 3.8 `labelFor` 做了 fallback 用 backend label

---

## Execution Handoff

Plan 已写完,保存在 `docs/superpowers/plans/2026-06-05-storyline-frontend-questions.md`。两种执行方式:

**1. Subagent-Driven(推荐)** — 我为每个 Task 派一个全新 subagent,Task 间我审 + 两段式 review。适合 Plan A/A2 同款的稳健节奏。

**2. Inline Execution** — 在当前会话内逐 Task 跑,带 checkpoint。上下文已经热的、来回少。

哪种?
