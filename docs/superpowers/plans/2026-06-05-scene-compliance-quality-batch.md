# Scene 合规与质量批次 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一批为 Creem 支付上线（合规）+ 体验的 scene 改动：LLM 内容审核、人脸检测、本人勾选、质检放宽提速、移除白跑检查、LLM 故事线分类、职业服装补全。

**Architecture:** 大部分是在现有 service 层（依赖注入、可测）内调参或加 provider/函数，复用现成的 `llmJson` / OpenRouter vision / `getStorylineType` 等。审核与分类从正则升级为 LLM 语义判断 + 正则 fallback；人脸检测是 upload 阶段新增一道 vision LLM 闸；质检放宽是 `passes` 判定的容错调整。

**Tech Stack:** Next.js 16 App Router + TS、OpenRouter（Gemini text/vision）、next-intl、Vitest。**仓库非 git**，所有"Commit"替换为 `pnpm test` + `pnpm lint`。设计细节见 spec `docs/superpowers/specs/2026-06-05-scene-compliance-quality-batch-design.md`。

**关键决策（已定）**：质检 `identityOverrideQuality=4`（env 可调）；审核默认 `llm` provider；上传加人脸检测 + 必勾本人照片。

---

## 执行顺序：合规组（Task 5-8）优先 → 速度组（Task 1-2）→ 内容组（Task 3-4）

> 合规组直接卡 Creem 上线，建议先做。但 plan 按主题编号；执行可按 5,6,7,8,1,2,3,4 顺序。

---

## Task 1: 质检放宽（identity 误判容错）

**Files:**
- Modify: `lib/scene/config.ts`（新增 `identityOverrideQuality` + `identityStrict`）
- Modify: `lib/scene/orchestrator.ts`（改 `passes`，约 35-50 行区有 `passes` 定义；resolveFrame line 80 调用）
- Test: `tests/lib/scene/identity-relax.test.ts`（新）

- [ ] **Step 1.1:** 先 Read `lib/scene/orchestrator.ts` 找到 `passes` 函数定义（resolveFrame 在 line 80 调用 `passes(q, qualityMin)`，定义应在文件靠前）。确认其现有逻辑（应等价于 `q.same_person && !q.deformity && !q.plastic_skin && q.quality >= qualityMin`）。

- [ ] **Step 1.2:** 写测试 `tests/lib/scene/identity-relax.test.ts`：导出并测试 `passes`（若 `passes` 未导出，本 task 顺手 `export` 它）：
```ts
import { describe, it, expect } from "vitest";
import { passes } from "@/lib/scene/orchestrator";
const q = (o: Partial<{same_person:boolean;deformity:boolean;plastic_skin:boolean;quality:number}>) =>
  ({ same_person:false, deformity:false, plastic_skin:false, quality:0, issues:[], ...o });
describe("passes：质检放宽(identity 误判容错)", () => {
  it("same_person 直接过", () => expect(passes(q({same_person:true,quality:3}),3)).toBe(true));
  it("same_person=false 但 quality>=4(override)→ 过", () => expect(passes(q({same_person:false,quality:4}),3)).toBe(true));
  it("same_person=false 且 quality=3(<override)→ 不过", () => expect(passes(q({same_person:false,quality:3}),3)).toBe(false));
  it("畸形一律不过", () => expect(passes(q({same_person:true,quality:5,deformity:true}),3)).toBe(false));
  it("identityStrict=true 时 same_person=false 即使 quality=5 也不过", () => expect(passes(q({same_person:false,quality:5}),3,{strict:true})).toBe(false));
});
```

- [ ] **Step 1.3:** 跑确认 FAIL。

- [ ] **Step 1.4:** `lib/scene/config.ts` 在 `maxCandidatesPerFrame` 附近新增：
```ts
  // identity 质检容错：vision LLM 判 same_person 误判率高(好图被判 false)→ 反复重试烧时间。
  // 质量足够高(>=identityOverrideQuality)时容忍 same_person=false(多半误判),减少假失败。
  // identityStrict=true 恢复 same_person 一票否决。详见 plan/spec。
  identityOverrideQuality: numEnv('SCENE_IDENTITY_OVERRIDE_QUALITY', 4),
  identityStrict: process.env.SCENE_IDENTITY_STRICT === 'true',
```

- [ ] **Step 1.5:** 改 `passes`（导出 + 加放宽逻辑 + 可选 strict 参数）：
```ts
// 单帧及格：无畸形/塑料皮 + 质量达标；same_person 直接过，
// 或质量很高(>=identityOverrideQuality)时容忍 same_person 误判(除非 identityStrict)。
export function passes(
  q: QualityResult,
  qualityMin: number,
  opts?: { overrideQuality?: number; strict?: boolean },
): boolean {
  if (q.deformity || q.plastic_skin) return false;
  if (q.quality < qualityMin) return false;
  if (q.same_person) return true;
  const strict = opts?.strict ?? sceneConfig.identityStrict;
  const override = opts?.overrideQuality ?? sceneConfig.identityOverrideQuality;
  return !strict && q.quality >= override;
}
```
（确保 orchestrator 顶部 import 了 `sceneConfig`；resolveFrame 的 `passes(q, qualityMin)` 调用保持不变——默认从 config 读 strict/override。）

- [ ] **Step 1.6:** 跑测试 PASS + `pnpm test && pnpm lint` 全绿。

---

## Task 2: 移除白跑的组一致性检查

**Files:** Modify `lib/scene/orchestrator.ts:214-219`

- [ ] **Step 2.1:** 把这段（runGeneration 内）：
```ts
  // 组一致性（对已交付帧）
  const kept = outcomes.filter(o => o.status === "passed" || o.status === "swapped");
  let coherence: SetCoherenceResult | undefined;
  if (kept.length > 0) {
    coherence = await deps.checkSetCoherence(selfieUrl, kept.map(o => o.imageUrl as string), plan);
  }
```
改为（移除阻塞的 vision LLM 调用，结果本就无人读取；保留 kept 供后续救援用）：
```ts
  // 组一致性检查已移除：其结果(coherence)全项目无人读取/落库/拦截，是 5-20s 的阻塞浪费。
  // 保留 deps.checkSetCoherence 注入与 set-coherence-check 模块，未来要用可重启用。
  const kept = outcomes.filter(o => o.status === "passed" || o.status === "swapped");
  const coherence: SetCoherenceResult | undefined = undefined;
```

- [ ] **Step 2.2:** 跑 `pnpm test && pnpm lint`。若有测试断言 `checkSetCoherence` 被调用而失败，更新该测试为"不再调用"（人一致性已不在交付路径）。`coherence` 仍在 return（undefined），类型不变。

---

## Task 3: LLM 故事线分类

**Files:**
- Modify: `lib/scene/services/scene-planner.ts`（`analyzeInput` + 新 `classifyStorylineLLM`）
- Modify: `lib/scene/prompts.ts`（分类 prompt）
- Test: `tests/lib/scene/analyze-input.test.ts`（增强）

- [ ] **Step 3.1:** `lib/scene/prompts.ts` 新增分类 prompt 构造函数：
```ts
// 故事线分类：让 LLM 把用户场景归到 8 类之一,识别真实意图(如"变身大厨"=想当现代厨师→profession)。
export function classifyInstruction(safePrompt: string, types: { id: string; logic: string }[]): string {
  const list = types.map(t => `- ${t.id}: ${t.logic}`).join("\n");
  return `Classify the user's desired photo scene into exactly ONE storyline type id from this list:
${list}

User scene: "${safePrompt}"

Rules:
- Pick by the user's REAL intent, not surface keywords. e.g. "变身大厨/become a chef" means they want to BE a modern chef → profession (NOT a fantasy transformation). "穿越古代/time travel" is fantasy_role.
- Reply STRICT JSON only: {"storyline_type":"<one id from the list>"}`;
}
```

- [ ] **Step 3.2:** `scene-planner.ts` 新增 `classifyStorylineLLM`（复用 `llmJson`，line 32）+ 改 `analyzeInput`：
```ts
async function classifyStorylineLLM(safePrompt: string): Promise<StorylineType | null> {
  const types = STORYLINE_TYPES.map(t => ({ id: t.id, logic: t.organizingLogic }));
  const out = await llmJson<{ storyline_type: string }>(classifyInstruction(safePrompt, types));
  const id = out?.storyline_type;
  return id && STORYLINE_TYPES.some(s => s.id === id) ? (id as StorylineType) : null;
}

export async function analyzeInput(safePrompt: string): Promise<InputAnalysis> {
  // LLM 语义分类(中英文、识别真实意图);失败/无 key/非法 → 正则 fallback(getStorylineType)。
  const llmType = await classifyStorylineLLM(safePrompt);
  const typeDef = llmType ? storylineDef(llmType) : getStorylineType(safePrompt);
  return {
    storyline_type: typeDef.id,
    tone_suggestions: typeDef.toneBias.slice(0, 1),
    focus_options: typeDef.focusOptions,
  };
}
```
（确保 `classifyInstruction` 从 prompts import；`STORYLINE_TYPES`/`getStorylineType`/`storylineDef` 已在 scene-planner 可用——确认 import。）

- [ ] **Step 3.3:** 增强 `tests/lib/scene/analyze-input.test.ts`：mock `@/lib/openrouter/chat` 的 `createOpenRouterChat` 返回 `'{"storyline_type":"profession"}'` → `analyzeInput("变身大厨")` 应得 `storyline_type==="profession"`；mock 抛错（无 key）→ 应 fallback 到正则（`getStorylineType("去三亚旅行")==="journey"`）。保留原有断言（tone_suggestions 长度 1）。先看现有 mock 结构再加。

- [ ] **Step 3.4:** `pnpm test && pnpm lint` 全绿。

---

## Task 4: 职业服装文案补全

**Files:**
- Modify: `constants/scene-storylines.ts`（profession `attireHint`，约 line 68）
- Modify: `lib/scene/services/story-line.ts:111`（fallback modern 分支）

- [ ] **Step 4.1:** profession 的 `attireHint` 改为：
```ts
    attireHint: "the profession's real uniform — chef: white double-breasted chef jacket, checkered or dark chef pants, toque/chef hat, AND apron tied at the waist; doctor: white coat with a stethoscope; pilot: airline uniform with epaulettes and captain's hat; executive: tailored suit. ALWAYS include the FULL set of standard uniform items for the profession, never substitute casual clothing.",
```

- [ ] **Step 4.2:** Read `lib/scene/services/story-line.ts` 的 `fallbackStoryline`（约 104-113）。把 modern 分支硬编码的 `"modern casual outfit fitting the scene"` 改为读 `typeDef.attireHint`（无 LLM key 时也能给职业制服）。具体：找到 modern 分支返回 outfit 的那行，用 `input` 对应的 typeDef 的 attireHint。若 fallbackStoryline 当前拿不到 typeDef，先 `const typeDef = STORYLINE_TYPES.find(s => s.id === input.storylineType) ?? ...` 再用 `typeDef.attireHint`。

- [ ] **Step 4.3:** `pnpm test && pnpm lint`（无新测试，确认现有 storyline 测试不因文案变动而断言失败；若有断言旧 outfit 文案的测试，更新它）。

---

## Task 5: LLM 内容审核（替代正则，中英文）

**Files:**
- Modify: `lib/scene/services/prompt-moderation.ts`（新 `llmScreen` provider）
- Modify: `lib/scene/prompts.ts`（审核 prompt）
- Modify: `lib/scene/config.ts`（`moderationProvider` 默认 `'llm'`）
- Test: `tests/lib/scene/moderation-llm.test.ts`（新）

- [ ] **Step 5.1:** `lib/scene/prompts.ts` 新增审核 prompt：
```ts
// 内容审核：中英文语义判断是否可进入出图。类别对齐现有 ModerationReason。
export function moderationInstruction(prompt: string): string {
  return `You are a content safety reviewer for an app that puts the USER themselves into imagined photo scenes. Decide if this scene request is allowed. Consider BOTH English and Chinese.

Deny if it involves:
- adult: nudity, sexual, erotic, NSFW (中文如 裸体/色情/性爱)
- minor_safety: sexualizing minors/children (中文如 未成年/儿童 涉性)
- violence: gore, mutilation, graphic violence (中文如 血腥/暴力/残杀)
- impersonation: a REAL specific public figure / celebrity / politician by name (e.g. Trump/Biden/Musk/习近平/特朗普 etc.) — we only put the user in scenes, not real people
- deception_or_proof: claims of really owning/being/proving something real

Reply STRICT JSON only: {"decision":"allow"|"deny","reason":"adult"|"minor_safety"|"violence"|"impersonation"|"deception_or_proof"|null}`;
}
```

- [ ] **Step 5.2:** `prompt-moderation.ts` 新增 `llmScreen`（复用文本 LLM；导入 `createOpenRouterChat` + `sceneConfig` + `moderationInstruction`）：
```ts
async function llmScreen(input: ScreenInput): Promise<ModerationResult> {
  if (!hasTextProviderKey()) return localScreen(input); // 无 key 退正则预筛(dev 演示)
  try {
    const text = await createOpenRouterChat(
      [{ role: "user", content: moderationInstruction(input.safePrompt) }],
      { temperature: 0, max_tokens: 64, model: sceneConfig.textModel, reasoningEffort: "minimal" },
    );
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    const j = s !== -1 && e > s ? JSON.parse(text.slice(s, e + 1)) : null;
    if (!j || j.decision === "allow") return { decision: "allow", userMessage: "" };
    const reason = (VALID_REASONS.has(j.reason) ? j.reason : "unknown") as ModerationReason;
    return { decision: "deny", reason, userMessage: USER_MESSAGES[reason] };
  } catch {
    return FAIL_CLOSED_RESULT; // LLM 故障 fail closed
  }
}
```
在 `screenPrompt` 的 provider 分支加 `if (sceneConfig.moderationProvider === "llm") return await llmScreen(input);`（放在 creem 分支旁）。导入 `hasTextProviderKey`（来自 ../config）+ `createOpenRouterChat`（来自 ../../openrouter/chat）。

- [ ] **Step 5.3:** `config.ts`：把 `moderationProvider` 默认从 `'local'` 改为 `'llm'`（Read 确认当前定义行，env `SCENE_MODERATION_PROVIDER` 仍可覆盖；同时确认 `moderationProvider` 类型 union 含 `'llm'`，若没有则加上）。

- [ ] **Step 5.4:** 写 `tests/lib/scene/moderation-llm.test.ts`：mock `createOpenRouterChat` 返回 `'{"decision":"deny","reason":"impersonation"}'` → `screenPrompt({safePrompt:"dinner with Trump"})` 在 provider=llm 下 `isBlocked` 应 true；返回中文色情场景 deny → block；返回 `'{"decision":"allow"}'` → 放行。mock config moderationProvider='llm' + hasTextProviderKey true。

- [ ] **Step 5.5:** `pnpm test && pnpm lint` 全绿。

---

## Task 6: rejected 时 LLM 生成针对性安全替代 + 友好文案

**Files:**
- Modify: `lib/scene/prompts.ts`（替代 prompt）
- Modify: `lib/scene/services/scene-planner.ts` 或新 helper（`generateSafeAlternatives`）
- Modify: `app/api/scene/clarify/route.ts`（rejected 分支用 LLM 替代）
- Modify: `messages/{zh,en}.json`（友好文案微调）

- [ ] **Step 6.1:** prompts.ts 新增：
```ts
// 被拒后按用户原意图生成"符合意图但不违规"的安全替代场景。
export function safeAlternativesInstruction(rawPrompt: string): string {
  return `The user asked for a photo scene we can't generate as-is: "${rawPrompt}".
Suggest 3 SAFE alternative scenes that capture the same underlying vibe/aspiration but avoid real people, NSFW, violence, or real-world claims. Keep each short (under 8 words), concrete, appealing.
Reply STRICT JSON only: {"alternatives":["...","...","..."]}`;
}
```

- [ ] **Step 6.2:** 新增 `generateSafeAlternatives`（放 scene-planner.ts 或新 `lib/scene/services/safe-alternatives.ts`，复用 `llmJson`）：
```ts
export async function generateSafeAlternatives(rawPrompt: string): Promise<string[] | null> {
  const out = await llmJson<{ alternatives: string[] }>(safeAlternativesInstruction(rawPrompt));
  const a = out?.alternatives;
  return Array.isArray(a) && a.length ? a.slice(0, 3) : null;
}
```
若放新文件，记得 barrel 导出。

- [ ] **Step 6.3:** `app/api/scene/clarify/route.ts`：两处 rejected 返回里，把硬编码 `safeRewriteChips: SAFE_CHIPS` 改为 LLM 生成 + fallback：
```ts
const alts = await generateSafeAlternatives(rawPrompt).catch(() => null);
// ...rejected.safeRewriteChips: alts ?? SAFE_CHIPS
```
（保留 SAFE_CHIPS 作 fallback。导入 generateSafeAlternatives。）

- [ ] **Step 6.4:** `messages/zh.json` + `messages/en.json` 的 `scene.clarify` 文案微调为非指责语气（保留 key 名）：
  - `rejectedTitle`：zh "换个方式可能更好 ✨" / en "Let's tweak this a little ✨"
  - `rejectedBody`：zh "这个场景暂时没法直接生成。试试这些类似的方向 👇" / en "We can't create this one as-is. Try one of these similar ideas 👇"

- [ ] **Step 6.5:** `pnpm test && pnpm lint` + JSON 合法校验（node JSON.parse 两份）。

---

## Task 7: 人脸检测（upload 闸）

**Files:**
- Create: `lib/scene/services/face-check.ts`
- Modify: `lib/scene/services/index.ts`（导出 checkFace）
- Modify: `lib/scene/prompts.ts`（face-check prompt）
- Modify: `app/api/scene/upload/route.ts`（存图后调 checkFace）
- Test: `tests/lib/scene/face-check.test.ts`（新）

- [ ] **Step 7.1:** prompts.ts 新增：
```ts
export const FACE_CHECK_PROMPT = `Look at this image. Reply STRICT JSON only:
{"has_clear_face": true|false, "single_person": true|false, "issues": ["short reason", ...]}
- has_clear_face: is there ONE clearly visible human face, reasonably front-facing, not heavily obscured/blurred/filtered? (animals, objects, landscapes, text → false)
- single_person: is there exactly one person (not a group, not zero)?`;
```

- [ ] **Step 7.2:** Read `lib/scene/services/quality-check.ts` 作为范式（它用 `createOpenRouterVision` + `hasVisionProviderKey` + parse JSON）。创建 `lib/scene/services/face-check.ts`：
```ts
import { createOpenRouterVision } from "../../openrouter/chat";
import { sceneConfig, hasVisionProviderKey } from "../config";
import { FACE_CHECK_PROMPT } from "../prompts";

export interface FaceCheckResult { ok: boolean; reason?: "no_face" | "multiple_people"; }

export async function checkFace(selfieUrl: string): Promise<FaceCheckResult> {
  if (!hasVisionProviderKey() || !sceneConfig.visionModel) return { ok: true }; // dev 放行
  try {
    const text = await createOpenRouterVision(FACE_CHECK_PROMPT, [selfieUrl], {
      model: sceneConfig.visionModel, max_tokens: 128, reasoningEffort: "minimal",
    });
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    const j = s !== -1 && e > s ? JSON.parse(text.slice(s, e + 1)) : null;
    if (!j) return { ok: true }; // 解析失败保守放行(不误伤)
    if (!j.has_clear_face) return { ok: false, reason: "no_face" };
    if (j.single_person === false) return { ok: false, reason: "multiple_people" };
    return { ok: true };
  } catch {
    return { ok: true }; // 检测故障放行(不阻塞;正式可改 fail closed)
  }
}
```
注意 `createOpenRouterVision` 的图片参数形态以 quality-check.ts 的实际用法为准（它传 `[selfieUrl, candidateUrl]`，这里只传 `[selfieUrl]`）。

- [ ] **Step 7.3:** `lib/scene/services/index.ts` 加 `export { checkFace } from "./face-check"; export type { FaceCheckResult } from "./face-check";`

- [ ] **Step 7.4:** 写 `tests/lib/scene/face-check.test.ts`：mock `@/lib/scene/config`（hasVisionProviderKey true, visionModel "v"）+ mock `createOpenRouterVision`：返回 `'{"has_clear_face":false}'` → ok=false reason=no_face；返回 `'{"has_clear_face":true,"single_person":true}'` → ok=true；返回 `'{"has_clear_face":true,"single_person":false}'` → ok=false reason=multiple_people。另测无 key（hasVisionProviderKey false）→ ok=true。

- [ ] **Step 7.5:** Read `app/api/scene/upload/route.ts`，在自拍存储成功、拿到 selfieUrl 之后、返回成功之前，调 `checkFace(selfieUrl)`；若 `!ok`，返回 `{ ok:false, faceIssue: reason }`（HTTP 200，前端据此提示重传），不返回成功的 url（或返回但带 faceIssue 让前端拦）。具体形态按现有 upload route 的返回结构适配——保持向后兼容（成功路径仍返回 url）。

- [ ] **Step 7.6:** `pnpm test && pnpm lint` 全绿。

---

## Task 8: 前端 upload 步——人脸检测提示 + 本人照片勾选

**Files:**
- Modify: `app/[locale]/create/page.tsx`（upload 步 + onPickFile）
- Modify: `app/[locale]/create/scene-api.ts`（uploadSelfie 返回带 faceIssue）
- Modify: `messages/{zh,en}.json`

- [ ] **Step 8.1:** Read `app/[locale]/create/scene-api.ts` 的 `uploadSelfie`。让它返回的结构能携带 `faceIssue`（若 upload route 返回 `{ok:false, faceIssue}`，则 throw 一个带 reason 的错误或返回 `{ url?, faceIssue? }`）。前端据此区分"上传失败"vs"人脸不合格"。

- [ ] **Step 8.2:** `page.tsx` `onPickFile`：上传后若 faceIssue，setError 为对应友好文案（`t("upload.faceNoFace")` / `t("upload.faceMultiple")`），并清空 selfiePreview（不进入可继续状态）。

- [ ] **Step 8.3:** `page.tsx` upload 步：在"继续"按钮前加 checkbox：
```tsx
const [confirmedOwn, setConfirmedOwn] = useState(false);
// ...上传成功(selfieUrl 存在)后显示：
<label className="mt-4 flex items-start gap-2 text-xs text-stone-400">
  <input type="checkbox" checked={confirmedOwn} onChange={e => setConfirmedOwn(e.target.checked)} className="mt-0.5 accent-amber-300" />
  <span>{t("upload.confirmOwn")}</span>
</label>
```
"继续"按钮 `disabled={!selfieUrl || uploading || !confirmedOwn}`。reset() 里加 `setConfirmedOwn(false)`。

- [ ] **Step 8.4:** i18n 新增 `scene.upload.*`（zh/en）：
  - `faceNoFace`：zh "没检测到清晰的正脸，换一张自拍试试～" / en "We couldn't find a clear face — try another selfie."
  - `faceMultiple`：zh "照片里好像不止一个人，用单人正脸自拍效果最好。" / en "Looks like more than one person — a solo selfie works best."
  - `confirmOwn`：zh "我确认这是本人照片，且我有权使用它。" / en "I confirm this is my own photo and I have the right to use it."

- [ ] **Step 8.5:** `pnpm test && pnpm lint` + JSON 校验 + （preview 实测在最后统一做）。

---

## Task 9: preview 实测（合规 + 体验，统一验证）

- [ ] 重启 dev server（config 改动多）。
- [ ] 审核：输入"和特朗普共进晚餐"应被拦 + 给出针对性替代（米其林晚宴等）；中文色情/暴力词应被拦（验证不再中文全盲）；正常输入（迪拜）放行。
- [ ] 人脸检测：传一张非人脸图（风景/动物）应提示重传；传正常自拍放行 + 出现本人勾选；不勾"继续"禁用。
- [ ] 分类：clarify "变身大厨" 的 storyline_type 应为 profession（curl）。
- [ ] 速度：迪拜出图，看日志每帧 tried 是否下降（质检放宽生效）、第一张耗时是否降。
- [ ] `pnpm test && pnpm lint` 最终全绿。

---

## Self-Review

**Spec 覆盖**：#1 质检放宽→T1；#2 组一致性→T2；#3 LLM 分类→T3；#4 服装→T4；#5 LLM 审核→T5、针对性替代→T6；#6 人脸检测→T7、checkbox+前端→T8；实测→T9。全覆盖。

**类型一致性**：`passes`(T1) 签名 `(q, qualityMin, opts?)`；`checkFace`(T7) 返回 `FaceCheckResult{ok,reason}`，T8 消费；`generateSafeAlternatives`(T6) 返回 `string[]|null`，clarify route 消费；`analyzeInput`(T3) 返回结构不变（InputAnalysis）。一致。

**风险/占位**：多处 Step 要求"先 Read 现有文件确认精确结构再改"（upload route、moderationProvider 类型、passes 定义、createOpenRouterVision 图片参数形态）——这是因为这些现状需在执行时核实，不是占位符；每个都给了明确的核实目标 + 改法。

**关键风险**：质检放宽(T1)是质量权衡，已设 override=4 + env 可调 + strict 开关兜底；审核默认切 llm(T5)需确认 moderationProvider 类型 union 含 'llm'；人脸检测(T7)无 key 放行避免 dev 阻塞。

---

## Execution Handoff

按 spec 三组主题，建议执行顺序：合规组（T5→T6→T7→T8）优先（卡 Creem 上线）→ 速度组（T1→T2）→ 内容组（T3→T4）→ 实测（T9）。
