# UI 迭代实施计划 — 6 张保证 / AI 推荐优化 / 结果页 lightbox

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三个用户实测反馈的迭代修复 —— ①加大每帧重试提高 6 张达成率;②问答页 AI 推荐改为只荐 1 个、去金边、角标改"推荐"、emoji+标题一行、调性描述长度统一;③结果页点图放大查看(lightbox)+ 左右切换 + 下载 + 返回。

**Architecture:** 三个改动彼此独立。问题 1 是后端单参数(`config.maxCandidatesPerFrame` 默认 1→2,即每帧最多 3 次出图),保持质检门槛不变、极端仍可 partial+退积分。问题 2 = 后端 `analyzeInput` 只回 1 个调性 + i18n 文案(角标/提示/8 个 hint 长度统一) + 前端 `ToneStep` 布局(去金边、emoji+label 一行)。问题 3 = 前端 `result` 步把下载 `<a>` 改为打开 lightbox 的 `<button>` + 新增 `Lightbox` overlay 组件(state 驱动,左右切换+下载+ESC)。

**Tech Stack:** Next.js 16 App Router + React 19、next-intl、Framer Motion、Tailwind、Vitest。**仓库非 git**,所有"Commit"步骤替换为 `pnpm test` + `pnpm lint` 验证。前端 UI 改动靠 `pnpm lint`+`pnpm test`+ preview 实测验证(无组件级单测)。

---

## 背景:问题 1 现状(已调查)

- `lib/scene/config.ts:53` `maxCandidatesPerFrame: numEnv('SCENE_MAX_CANDIDATES', 1)` → 默认 **1**。
- `lib/scene/orchestrator.ts:326` `maxCandidates: sceneConfig.maxCandidatesPerFrame` 传入 → `resolveFrame` 的 `for (attempt = 0; attempt <= maxCandidates; attempt++)`(orchestrator.ts:69)→ 默认每帧最多 **2 次**出图(attempt 0,1)。
- 现有补救链:每帧 2 候选 → salvage(best 像本人且 quality≥salvageQualityMin 则接受) → dropped 帧用合格帧作 reference 重跑一次(orchestrator.ts:221-259) → 仍不行则 dropped 不展示 → job=partial + 退积分。
- **用户选择**:加大重试(每帧最多 3 次)尽量保 6 张,**保持质检门槛**(不展示不像本人的帧),极端仍可少张+退积分。
- **结论**:只需把 `maxCandidatesPerFrame` 默认 1→2(每帧 attempt 0,1,2 = 3 次)。env `SCENE_MAX_CANDIDATES` 仍可覆盖。只有失败帧才会跑满候选(成功帧 attempt 0 即 return),所以平均耗时增加有限;最坏情况(多帧失败)耗时上升,仍在 Vercel 300s 内(6 帧逐帧并行)。

---

## File Structure

**修改:**
- `lib/scene/config.ts` — `maxCandidatesPerFrame` 默认值 + 注释(问题 1)
- `lib/scene/services/scene-planner.ts` — `analyzeInput` 的 `tone_suggestions` 只回 1 个(问题 2)
- `messages/zh.json` / `messages/en.json` — `clarify.tone.aiBadge`/`aiHint` 改文案、8 个 `tones.<id>.hint` 重写为长度统一、新增 `result.close/prev/next`(问题 2+3)
- `app/[locale]/create/page.tsx` — `ToneStep` 卡片布局(问题 2)+ `result` 步 lightbox + 新增 `Lightbox` 组件(问题 3)

**不动:** orchestrator 的生成/质检/救援逻辑(只调参数);后端契约;其它步骤组件。

---

## Task 1: 问题 1 — 每帧重试上限 1→2(每帧最多 3 次)

**Files:**
- Modify: `lib/scene/config.ts:50-53`
- Test: `tests/lib/scene/pricing.ts` 同目录新增 `tests/lib/scene/max-candidates.test.ts`

- [ ] **Step 1.1: 写失败测试 — 默认每帧候选上限应为 2**

新建 `tests/lib/scene/max-candidates.test.ts`:
```ts
// config 的 maxCandidatesPerFrame 决定每帧最多出图次数(attempt 0..N → N+1 次)。
// 用户实测"只生成 5 张",决定加大重试:默认 1→2(每帧最多 3 次)。
// 注意:本测试不 mock config,直接验真实默认值(env 未设 SCENE_MAX_CANDIDATES 时)。
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("maxCandidatesPerFrame 默认值(每帧重试上限)", () => {
  const prev = process.env.SCENE_MAX_CANDIDATES;
  beforeEach(() => { delete process.env.SCENE_MAX_CANDIDATES; });
  afterEach(() => { if (prev !== undefined) process.env.SCENE_MAX_CANDIDATES = prev; });

  it("未设 env 时默认 2(每帧 attempt 0..2 = 最多 3 次出图)", async () => {
    // 动态 import 确保读到当前 env;config 在模块顶层用 numEnv 求值,
    // 故用 vitest 的 resetModules 重新加载。
    const { resetModules } = await import("vitest");
    resetModules();
    const mod = await import("@/lib/scene/config");
    expect(mod.sceneConfig.maxCandidatesPerFrame).toBe(2);
  });
});
```

注意:config 在模块顶层求值 env,若 `resetModules` 在该 vitest 版本 API 不同,改用更稳的断言方式 —— 直接验"config 模块导出的默认值字面量"。若动态 import + resetModules 不稳,退化为:读 `lib/scene/config.ts` 源码断言默认参数是 2(见 Step 1.2 的备选)。先尝试运行时断言。

- [ ] **Step 1.2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/max-candidates.test.ts`
Expected: FAIL(当前默认是 1,断言 2 失败)。

若 `resetModules`/动态 import 在本项目 vitest 配置下读不到真实 env(因为 config 可能已被其它测试的 mock 污染或顶层已求值),则把测试改为**源码断言**(确定性、零依赖):
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("config.ts 默认 SCENE_MAX_CANDIDATES 为 2", () => {
  const src = readFileSync(resolve(process.cwd(), "lib/scene/config.ts"), "utf8");
  expect(src).toMatch(/numEnv\(['"]SCENE_MAX_CANDIDATES['"],\s*2\)/);
});
```
这个备选稳定可靠,优先用它(避免 env/模块缓存的脆弱性)。

- [ ] **Step 1.3: 改 config 默认值 + 注释**

`lib/scene/config.ts:50-53`,把:
```ts
  // 默认 1（首图 + 1 重试 = 最多 2 候选），加 salvage 兜底（首图 best 自动接受）；
  // 6 张 ≈ 60-100s 出齐。质量门用 prompt 强化 + weak frame rerun 双保险。
  // 若要更高质量可设 SCENE_MAX_CANDIDATES=2（多 30-50s/帧），更快可设 0。
  maxCandidatesPerFrame: numEnv('SCENE_MAX_CANDIDATES', 1),
```
改为:
```ts
  // 默认 2（首图 + 2 重试 = 最多 3 候选），加 salvage 兜底 + dropped 帧重跑救援；
  // 用户实测"只出 5 张"→ 加大重试提高 6/6 达成率，保持质检门槛（不展示不像本人的帧）。
  // 只有失败帧才会跑满候选（成功帧首图即返回），平均耗时增加有限；6 张逐帧并行仍在 Vercel 300s 内。
  // 更快可设 SCENE_MAX_CANDIDATES=1（最多 2 候选），更稳可设 3。
  maxCandidatesPerFrame: numEnv('SCENE_MAX_CANDIDATES', 2),
```

- [ ] **Step 1.4: 跑测试确认通过**

Run: `pnpm test tests/lib/scene/max-candidates.test.ts`
Expected: PASS。

- [ ] **Step 1.5: 跑全量 + lint 确认无回归**

Run: `pnpm test && pnpm lint`
Expected: 全绿(原 261 + 1 新增 = 262)。

- [ ] **Step 1.6: 验证(替代 commit)**

仓库非 git。Run: `pnpm test && pnpm lint`,确认全绿即视为本 task 完成。

---

## Task 2: 问题 2 — AI 推荐 UI(只荐 1 个 / 去金边 / 角标"推荐" / emoji+标题一行 / 描述长度统一)

**Files:**
- Modify: `lib/scene/services/scene-planner.ts:207`
- Modify: `messages/zh.json`(clarify.tone.aiBadge/aiHint + 8 个 tones.<id>.hint)
- Modify: `messages/en.json`(对称)
- Modify: `app/[locale]/create/page.tsx`(ToneStep 卡片布局 + ring 去金边)
- Test: `tests/lib/scene/analyze-input.test.ts`(加断言 tone_suggestions 长度为 1)

- [ ] **Step 2.1: 改 analyze-input 测试 — 只荐 1 个**

在 `tests/lib/scene/analyze-input.test.ts` 的第一个用例(`据关键词判 storyline_type...`)里,把现有的:
```ts
    expect(r.tone_suggestions.length).toBeGreaterThanOrEqual(1);
```
改为:
```ts
    expect(r.tone_suggestions.length).toBe(1); // 只推荐 1 个(用户反馈:推荐 2 个+金边易被误以为已选)
```

- [ ] **Step 2.2: 跑测试确认失败**

Run: `pnpm test tests/lib/scene/analyze-input.test.ts`
Expected: FAIL(当前 `slice(0,2)` 返回 2 个,断言 1 失败)。

- [ ] **Step 2.3: 后端只回 1 个调性**

`lib/scene/services/scene-planner.ts:207`,把:
```ts
    tone_suggestions: typeDef.toneBias.slice(0, 2),
```
改为:
```ts
    tone_suggestions: typeDef.toneBias.slice(0, 1), // 只荐 1 个(UI 去金边 + 角标"推荐")
```
同时更新 195-198 处 `InputAnalysis` 接口注释 `// 高亮的调性 id(1-2 个)` → `// 推荐的调性 id(1 个)`,以及 line 197 上方注释里若有"1-2 个"也一并改为"1 个"。

- [ ] **Step 2.4: 跑测试确认通过**

Run: `pnpm test tests/lib/scene/analyze-input.test.ts`
Expected: PASS。

- [ ] **Step 2.5: i18n — 角标/提示文案 + 8 个 hint 长度统一(zh)**

在 `messages/zh.json`:

(a) `scene.clarify.tone` 内:
```json
        "aiHint": "⭐ AI 已为你高亮",
        "aiBadge": "AI",
```
改为:
```json
        "aiHint": "⭐ 为你推荐",
        "aiBadge": "推荐",
```

(b) `scene.tones` 整段的 8 个 `hint` 改为**统一 8 个汉字**(移动端一行不换行、视觉整齐),label 不变:
```json
    "tones": {
      "narrative_doc": { "label": "叙事纪实", "hint": "真实记录的纪实感" },
      "surprise_highlight": { "label": "惊喜高光", "hint": "难忘高光的惊喜感" },
      "healing_chill": { "label": "松弛治愈", "hint": "慢节奏的温暖治愈" },
      "cinematic_drama": { "label": "电影戏剧", "hint": "电影般的戏剧张力" },
      "versailles_flex": { "label": "凡尔赛炫耀", "hint": "低调奢华的上流感" },
      "funny_meme": { "label": "搞笑沙雕", "hint": "轻松搞笑的玩梗感" },
      "romantic": { "label": "浪漫氛围", "hint": "柔光浪漫的梦境感" },
      "epic_blood": { "label": "燃系热血", "hint": "高能热血的燃系感" }
    },
```
(每个 hint 均为 8 个汉字。)

- [ ] **Step 2.6: i18n — en 对称**

在 `messages/en.json`:

(a) `scene.clarify.tone` 内:
```json
        "aiHint": "⭐ AI highlighted for you",
        "aiBadge": "AI",
```
改为:
```json
        "aiHint": "⭐ Suggested for you",
        "aiBadge": "Pick",
```

(b) `scene.tones` 的 8 个 `hint` 改为**词数/长度尽量一致**(每个 3 词、字符数接近),label 不变:
```json
    "tones": {
      "narrative_doc": { "label": "Documentary", "hint": "Real, candid, vlog-like" },
      "surprise_highlight": { "label": "Surprise Highlight", "hint": "Unexpected, delightful, memorable" },
      "healing_chill": { "label": "Calm & Cozy", "hint": "Slow, warm, soothing" },
      "cinematic_drama": { "label": "Cinematic", "hint": "Filmic, dramatic, tense" },
      "versailles_flex": { "label": "Quiet Flex", "hint": "Understated, upscale, enviable" },
      "funny_meme": { "label": "Playful Meme", "hint": "Light, funny, playful" },
      "romantic": { "label": "Romantic", "hint": "Soft, dreamy, romantic" },
      "epic_blood": { "label": "Epic Energy", "hint": "Bold, heroic, electric" }
    },
```

- [ ] **Step 2.7: 验证两份 JSON 合法 + 对称**

Run:
```bash
node -e 'const fs=require("fs");const zh=JSON.parse(fs.readFileSync("messages/zh.json","utf8"));const en=JSON.parse(fs.readFileSync("messages/en.json","utf8"));const k=o=>Object.keys(o).sort().join(",");const ok=k(zh.scene.tones)===k(en.scene.tones)&&zh.scene.clarify.tone.aiBadge==="推荐"&&en.scene.clarify.tone.aiBadge==="Pick"&&Object.values(zh.scene.tones).every(t=>[...t.hint].length===8);console.log(ok?"✅ JSON 合法+对称+zh hint 均 8 字":"❌ 校验失败");process.exit(ok?0:1)'
```
Expected: 输出 `✅ JSON 合法+对称+zh hint 均 8 字`。

- [ ] **Step 2.8: 前端 ToneStep — 去金边 + emoji/label 一行**

在 `app/[locale]/create/page.tsx` 的 `ToneStep` 组件里:

(a) 找到 `ring` 计算(约 900-905 行):
```ts
          const ring = isActive
            ? "border-amber-300 bg-amber-300/15 text-amber-100"
            : isSuggested
              ? "border-amber-300/60 bg-amber-300/[0.08] text-amber-100"
              : "border-white/10 bg-white/[0.02] text-stone-200 hover:border-white/25";
```
改为(去掉 isSuggested 的金边分支 —— 推荐项不再高亮边框,只保留右上角标):
```ts
          // 推荐项不再描金边(避免被误以为"已选");只有用户真正点选才出现 active 金边。
          const ring = isActive
            ? "border-amber-300 bg-amber-300/15 text-amber-100"
            : "border-white/10 bg-white/[0.02] text-stone-200 hover:border-white/25";
```

(b) 找到卡片内部(约 906-917 行):
```tsx
            <button
              key={tone.id}
              type="button"
              onClick={() => onPick(tone.id)}
              aria-pressed={isActive}
              className={`relative flex flex-col items-start gap-1.5 rounded-2xl border px-3 py-3 text-left transition ${ring}`}
            >
              {isSuggested && (
                <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-stone-900">
                  {t("clarify.tone.aiBadge")}
                </span>
              )}
              <span aria-hidden className="text-[22px] leading-none">{tone.emoji}</span>
              <span className="text-[13px] font-semibold leading-tight">{t(`tones.${tone.id}.label`)}</span>
              <span className="text-[11px] leading-tight text-stone-400">{t(`tones.${tone.id}.hint`)}</span>
            </button>
```
改为(emoji + label 合并为一行,hint 仍第二行;角标保留):
```tsx
            <button
              key={tone.id}
              type="button"
              onClick={() => onPick(tone.id)}
              aria-pressed={isActive}
              className={`relative flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${ring}`}
            >
              {isSuggested && (
                <span className="absolute right-2 top-2 rounded-full bg-amber-300/90 px-1.5 py-[1px] text-[9px] font-bold tracking-wide text-stone-900">
                  {t("clarify.tone.aiBadge")}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="text-[18px] leading-none">{tone.emoji}</span>
                <span className="text-[13px] font-semibold leading-tight">{t(`tones.${tone.id}.label`)}</span>
              </span>
              <span className="text-[11px] leading-tight text-stone-400">{t(`tones.${tone.id}.hint`)}</span>
            </button>
```
(注:角标去掉 `uppercase`,因为"推荐"是中文;en "Pick" 不需大写化也 OK。)

- [ ] **Step 2.9: lint + 全量测试**

Run: `pnpm lint && pnpm test`
Expected: 全绿。grep 确认无残留:`grep -nE 'tone_suggestions.*slice\(0, 2\)' lib/scene/services/scene-planner.ts`(应空)。

- [ ] **Step 2.10: 验证(替代 commit)**

Run: `pnpm lint && pnpm test`,全绿即完成。preview 实测(若可)在 Task 4 统一做。

---

## Task 3: 问题 3 — 结果页 lightbox(点图放大 + 左右切换 + 下载 + 返回)

**Files:**
- Modify: `messages/zh.json` / `messages/en.json`(result.close/prev/next)
- Modify: `app/[locale]/create/page.tsx`(result 步 `<a>`→`<button>` + lightboxIndex state + 新增 `Lightbox` 组件 + 新 import 图标)

- [ ] **Step 3.1: i18n 新增 lightbox 文案**

`messages/zh.json` 的 `scene.result` 内(在 `cover` 旁)新增:
```json
      "close": "关闭",
      "prev": "上一张",
      "next": "下一张",
```
`messages/en.json` 的 `scene.result` 内对称新增:
```json
      "close": "Close",
      "prev": "Previous",
      "next": "Next",
```
(注意 JSON 逗号:加在现有键之间,保持合法。)

- [ ] **Step 3.2: 新增图标 import**

`app/[locale]/create/page.tsx` 顶部 lucide import 行,把:
```ts
import { ArrowLeft, ArrowRight, Camera, Download, Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";
```
改为(新增 `X, ChevronLeft, ChevronRight`):
```ts
import { ArrowLeft, ArrowRight, Camera, ChevronLeft, ChevronRight, Download, Loader2, Pencil, RotateCcw, Sparkles, X } from "lucide-react";
```

- [ ] **Step 3.3: 加 lightbox state**

在 `CreatePage` 组件内、其它 `useState` 旁(如 `jobView` 附近)新增:
```ts
  // 结果页 lightbox:存当前放大查看的帧在 resultFrames 数组里的下标(null=未打开)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
```

- [ ] **Step 3.4: result 网格改为打开 lightbox 的 button**

`app/[locale]/create/page.tsx` 的 result 网格(约 436-449 行),把:
```tsx
                <div className={`mt-7 grid gap-3 ${resultFrames.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {resultFrames.map(f => (
                    <a key={f.index} href={f.imageUrl ?? "#"} download={`sceneself-${f.index}.jpg`} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.imageUrl ?? ""} alt={f.narrativeRole ?? ""} className="h-full w-full object-cover" />
                      {f.isCover && (
                        <span className="absolute left-2 top-2 rounded-full bg-amber-300/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-900">{t("result.cover")}</span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                        <Download className="h-6 w-6 text-white" />
                      </span>
                    </a>
                  ))}
                </div>
```
改为(点击打开 lightbox,传数组下标 i;hover 提示图标改为放大语义,用 Sparkles 或保留 Download 都可 —— 这里用一个"查看"放大圈):
```tsx
                <div className={`mt-7 grid gap-3 ${resultFrames.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {resultFrames.map((f, i) => (
                    <button key={f.index} type="button" onClick={() => setLightboxIndex(i)} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.imageUrl ?? ""} alt={f.narrativeRole ?? ""} className="h-full w-full object-cover" />
                      {f.isCover && (
                        <span className="absolute left-2 top-2 rounded-full bg-amber-300/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-900">{t("result.cover")}</span>
                      )}
                      <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
                    </button>
                  ))}
                </div>
```

- [ ] **Step 3.5: 在 result section 内挂载 Lightbox**

在 result `<motion.section>` 内、`<div className="mt-8 space-y-3">`(再生成按钮)之后、`</motion.section>` 之前,加:
```tsx
                {lightboxIndex !== null && resultFrames[lightboxIndex] && (
                  <Lightbox
                    t={t}
                    frames={resultFrames}
                    index={lightboxIndex}
                    onIndex={setLightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                  />
                )}
```

- [ ] **Step 3.6: 新增 Lightbox 组件**

在 `app/[locale]/create/page.tsx` 底部(`ErrorLine` 等组件旁)新增。支持:点暗背景/关闭钮返回、左右箭头+键盘 ←/→ 切换、ESC 关闭、下载按钮、图片本身阻止冒泡:
```tsx
// 结果页放大查看:全屏 overlay + 左右切换 + 下载 + ESC/箭头键。
// index 是 frames(=resultFrames)数组下标;onIndex 切换,onClose 关闭。
function Lightbox({
  t,
  frames,
  index,
  onIndex,
  onClose,
}: {
  t: ReturnType<typeof useTranslations>;
  frames: JobView["frames"];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const f = frames[index];
  const go = useCallback(
    (delta: number) => onIndex((index + delta + frames.length) % frames.length),
    [index, frames.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!f) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      {/* 关闭 */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("result.close")}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 上一张 */}
      {frames.length > 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); go(-1); }}
          aria-label={t("result.prev")}
          className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* 大图(阻止冒泡,点图不关闭) */}
      <div onClick={e => e.stopPropagation()} className="relative max-h-[82vh] w-auto max-w-[90vw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.imageUrl ?? ""} alt={f.narrativeRole ?? ""} className="max-h-[82vh] w-auto max-w-[90vw] rounded-2xl object-contain" />
        {/* 计数 + 下载 */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs tabular-nums text-stone-400">{index + 1} / {frames.length}</span>
          <a
            href={f.imageUrl ?? "#"}
            download={`sceneself-${f.index}.jpg`}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
          >
            <Download className="h-4 w-4" /> {t("result.download")}
          </a>
        </div>
      </div>

      {/* 下一张 */}
      {frames.length > 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); go(1); }}
          aria-label={t("result.next")}
          className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </motion.div>
  );
}
```
注:`useCallback`/`useEffect` 已在文件顶部 import(`import { useCallback, useEffect, useMemo, useRef, useState } from "react"`),无需新增。`result.download` i18n key 已存在。

- [ ] **Step 3.7: lint + 测试**

Run: `pnpm lint && pnpm test`
Expected: 全绿。确认无未用 import(`X/ChevronLeft/ChevronRight` 均在 Lightbox 用到;`Download` 仍在用)。

- [ ] **Step 3.8: 验证 JSON 合法**

Run: `node -e 'const fs=require("fs");["zh","en"].forEach(l=>{const d=JSON.parse(fs.readFileSync("messages/"+l+".json","utf8"));if(!d.scene.result.close||!d.scene.result.prev||!d.scene.result.next)throw new Error(l+" result.* 缺失");});console.log("✅ result lightbox i18n ok")'`
Expected: `✅ result lightbox i18n ok`。

- [ ] **Step 3.9: 验证(替代 commit)**

Run: `pnpm lint && pnpm test`,全绿即完成。

---

## Task 4: preview 实测验证(可观察的改动)

**Files:** 仅 dev server + 浏览器,只读验证。

- [ ] **Step 4.1: 重启 dev server**

按踩坑提醒:改 server 代码(config.ts)后 hot-reload 不可靠。`preview_stop` + `preview_start`(或重启 `pnpm dev`)。env 改动也需重启。

- [ ] **Step 4.2: 验证问题 2(需登录态走到 tone 步)**

上传自拍 → 输入"豪华游轮看鲸鱼" → 进 Q1 调性页,确认:
- 只有 **1 个**调性带右上角标(journey 类是"叙事纪实")
- 角标文字是 **"推荐"**(en "Pick"),不是 "AI"
- 推荐项**没有金边/高亮背景**(和其它卡一致)
- 每张卡 **emoji + 标题在同一行**,描述文字在第二行且长度看起来整齐
- 点任意卡 → 出现金边(active),与"推荐"角标区分清楚

- [ ] **Step 4.3: 验证问题 3(结果页 lightbox)**

到 result 步(可用 `?job=<已完成jobId>` 直接加载历史结果):
- 点任意图 → 全屏放大查看
- 左右箭头/键盘 ←→ 切换看下一张
- 点暗背景/右上 X/ESC → 返回网格
- 下载按钮可下载当前图
- 再点另一张 → 正常打开

- [ ] **Step 4.4: 验证问题 1(后端,不必出图)**

问题 1 无前端可见点(只影响生成重试)。确认配置生效:
Run: `grep -n "SCENE_MAX_CANDIDATES" lib/scene/config.ts`(应显示默认 2)。
真实出图验证留给用户实测(看是否更稳定凑齐 6 张);耗时关注 dev server 日志里每帧 `tried=` 是否在失败时到 2-3。

- [ ] **Step 4.5: 最终全套**

Run: `pnpm lint && pnpm test`
Expected: 全绿(262)。

---

## Self-Review Checklist

**1. Spec 覆盖**
- ✅ 问题 1(6 张/加大重试)→ Task 1(maxCandidatesPerFrame 1→2)
- ✅ 问题 2.1 只荐 1 个 → Task 2.3(slice 0,1)
- ✅ 问题 2.2 不框出来(去金边)→ Task 2.8(a)(去 isSuggested 金边分支)
- ✅ 问题 2.3 角标"推荐"非"AI" → Task 2.5/2.6(aiBadge)
- ✅ 问题 2.4 emoji+标题一行 → Task 2.8(b)(flex items-center 包 emoji+label)
- ✅ 用户补充:描述第二行长度统一 → Task 2.5(zh 均 8 字)/2.6(en 均 3 词)
- ✅ 问题 3 点图查看+返回 → Task 3(lightbox)
- ✅ 用户确认:左右切换 → Task 3.6(go(±1) + 箭头 + 键盘)+ 下载保留

**2. 占位符扫描**:无 TBD/TODO;每个改动给了具体代码/文案。

**3. 类型一致性**:
- `Lightbox` props(t/frames/index/onIndex/onClose)在 Task 3.5 挂载处与 3.6 定义处一致。
- `frames: JobView["frames"]`,`resultFrames` 即该类型的 filter 结果,传入兼容。
- `lightboxIndex: number | null`,挂载用 `lightboxIndex !== null && resultFrames[lightboxIndex]` 守卫。
- `setLightboxIndex` 即 `onIndex` 签名 `(i:number)=>void` 兼容(注:onClose 用 `() => setLightboxIndex(null)` 单独传)。

**4. 关键风险**:
- config.ts 改动需重启 dev server(Task 4.1)。
- Task 1 测试优先用源码断言(稳定),避免 env/模块缓存脆弱性。
- JSON 逗号:Task 2.5/3.1 在现有键间插入,Task 2.7/3.8 用 node 校验合法性。
- 角标"推荐"去掉了 `uppercase`(中文不需要)。

---

## Execution Handoff

Plan 已写完,保存在 `docs/superpowers/plans/2026-06-05-ui-iteration-6shots-tone-lightbox.md`。两种执行方式:

**1. Subagent-Driven(推荐)** — 每 task 派 fresh subagent + 两段式 review。
**2. Inline Execution** — 当前会话逐 task 跑,带 checkpoint(上下文已热,改动聚焦,来回少)。

哪种?
