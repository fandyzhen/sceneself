# SceneSelf v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 登录门槛化的 6×50 积分计费、HEIC 上传兼容、分层问答、去 review 的低焦虑等待流程,以及把生成从 ~170s 压到 ~40–65s 的编排提速。

**Architecture:** 复用既有模板的 auth/credits/Drizzle/R2;计费走既有 `creditLedger`/`subscription`;编排重构为"每帧独立流水线 + 完成即揭晓 + 超时降级";前端 `create/page.tsx` 按步骤拆分以容纳等待动画。

**Tech Stack:** Next.js 16 / React 19 / Better Auth / Drizzle / Creem / R2 / Vitest / framer-motion / heic-convert

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `constants/billing.ts` | 三档订阅 weekly/monthly/yearly | 重构 |
| `lib/scene/config.ts` | 统一 6 张、`CREDITS_PER_PHOTO=50`、`maxCandidates=1` | 改 |
| `lib/scene/pricing.ts` | `creditsForSet/refundCredits/水印` 纯函数 | 新建 |
| `lib/billing/subscription-status.ts` | `hasActiveSubscription(userId)` | 新建 |
| `lib/scene/orchestrator.ts` | 每帧流水线 + 完成即揭晓 + 按未交付返还 | 重构 |
| `lib/scene/services/quality-check.ts` | 质检 20s 超时降级 | 改 |
| `lib/scene/services/image-gen.ts` | 出图超时 90s | 改 |
| `lib/image/heic.ts` | HEIC→JPEG 转码 | 新建 |
| `app/api/scene/upload/route.ts` | 必登录 + HEIC 转码 | 改 |
| `app/api/scene/clarify/route.ts`、`plan/route.ts` | 必登录 | 改 |
| `app/api/scene/jobs/route.ts` | 必登录 + 预扣 300 + 水印 by 订阅 | 改 |
| `scripts/setup-test-user.ts` | 测试账号年付+10万积分 | 新建 |
| `app/[locale]/create/page.tsx` + `create/_steps/*` | 去 review、问答分层+其他、等待页 | 重构/拆分 |
| `app/[locale]/create/scene-api.ts` | clarify→plan→job 串联 | 改 |
| 定价页 + `messages/{en,zh}.json` | 三档 + 文案 | 改 |

---

## Task 1: 计费常量与积分规则（纯函数,TDD）

**Files:** Create `lib/scene/pricing.ts`, `tests/lib/scene/pricing.test.ts`; Modify `constants/billing.ts`, `lib/scene/config.ts`

- [ ] **1.1 写失败测试** `tests/lib/scene/pricing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { creditsForSet, refundForUndelivered, watermarkFor, SHOTS_PER_SET, CREDITS_PER_PHOTO } from "@/lib/scene/pricing";

describe("pricing", () => {
  it("一组 6 张 × 50 = 300 积分", () => expect(creditsForSet()).toBe(300));
  it("SHOTS=6 CREDITS=50", () => { expect(SHOTS_PER_SET).toBe(6); expect(CREDITS_PER_PHOTO).toBe(50); });
  it("交付 4 张返还 2×50=100", () => expect(refundForUndelivered(4)).toBe(100));
  it("交付满 6 张不返还", () => expect(refundForUndelivered(6)).toBe(0));
  it("交付 0 张全额返还 300", () => expect(refundForUndelivered(0)).toBe(300));
  it("有订阅去水印", () => expect(watermarkFor({ hasSubscription: true })).toBe(false));
  it("无订阅带水印", () => expect(watermarkFor({ hasSubscription: false })).toBe(true));
});
```
- [ ] **1.2 跑测试确认失败** `pnpm test pricing` → FAIL (module not found)
- [ ] **1.3 实现** `lib/scene/pricing.ts`:
```ts
export const SHOTS_PER_SET = 6;
export const CREDITS_PER_PHOTO = 50;
export const creditsForSet = (shots = SHOTS_PER_SET) => shots * CREDITS_PER_PHOTO;
export const refundForUndelivered = (delivered: number, shots = SHOTS_PER_SET) =>
  Math.max(0, shots - delivered) * CREDITS_PER_PHOTO;
export const watermarkFor = (u: { hasSubscription: boolean }) => !u.hasSubscription;
```
- [ ] **1.4 重构 `constants/billing.ts`**：`PlanKey = "weekly"|"monthly"|"yearly"`,三档(见 spec 表),`grantSchedule: { mode: "per_cycle" }`,`creemPriceId` 占位空串。保留 `oneTimePacks` 类型但置空对象。导出 `RECOMMENDED_PLAN = "monthly"`。
- [ ] **1.5 改 `lib/scene/config.ts`**：`freeShotCount=6; paidShotCount=6; maxCandidatesPerFrame default 1`(`numEnv('SCENE_MAX_CANDIDATES', 1)`)。
- [ ] **1.6 跑测试确认通过 + tsc** `pnpm test pricing && npx tsc --noEmit`
- [ ] **1.7 Commit** `feat(billing): 三档订阅 + 6×50 积分规则`

## Task 2: 订阅状态/水印判定（TDD）

**Files:** Create `lib/billing/subscription-status.ts`, `tests/lib/billing/subscription-status.test.ts`

- [ ] **2.1 失败测试**：mock `db`,`hasActiveSubscription` 在有 `status='active' && currentPeriodEnd>now` 行时返回 true,否则 false。
- [ ] **2.2 跑→FAIL**
- [ ] **2.3 实现**：查询 `subscription` 表 `where userId AND status IN ('active','trialing') AND currentPeriodEnd > now()`,`limit 1`,返回布尔。
- [ ] **2.4 跑→PASS**
- [ ] **2.5 Commit** `feat(billing): hasActiveSubscription 水印判定`

## Task 3: Orchestrator 提速重构（TDD,核心）

**Files:** Modify `lib/scene/orchestrator.ts`, `lib/scene/services/quality-check.ts`, `lib/scene/services/image-gen.ts`; `tests/lib/scene/orchestrator.test.ts`

- [ ] **3.1 失败测试**：新增用例
  - "每帧完成立即 onFrame（不等其他帧）"：注入 generateImage 对 index=2 延迟,断言 index=1 的 onFrame 在 index=2 resolve 前已被调用（用回调时间序）。
  - "交付不足返还正确"：3 帧交付,`result.delivered===3`。
  - "质检超时降级接受"：checkQuality reject/超时 → 该帧仍 passed（降级）。
- [ ] **3.2 跑→FAIL**
- [ ] **3.3 重构 `runGeneration`**：把 `resolveFrame` 改为内部 `generate→quality→onFrame` 一体,每帧 async 内完成即 `await deps.onFrame`;封面在所有帧 settle 后用第二次轻量回调或在 onFrame 内用共享 ref 标记（保持"完成即揭晓",封面可后置一次 `onCover`）。删除"Promise.all 后串行 onFrame"。
- [ ] **3.4 改 `quality-check.ts`**：`createVisionCompletion` 包 `Promise.race` 20s 超时,超时返回 `{...DEV_PASS, quality: qualityMin}`。
- [ ] **3.5 改 `image-gen.ts`**：`AbortSignal.timeout(90000)`。
- [ ] **3.6 改 `runJob`**：R2 上传移入每帧（onFrame 内已并行,因每帧独立 async）;成功后计算 `refundForUndelivered(delivered)` 并对登录用户 `refundCredits(userId, amount, "scene_refund", jobId)`;`purgeIdentity`。
- [ ] **3.7 跑→PASS + 全量 `pnpm test scene`**
- [ ] **3.8 Commit** `perf(scene): 每帧流水线并行+完成即揭晓+超时降级`

## Task 4: 路由登录门槛 + 计费接线

**Files:** Modify `app/api/scene/{upload,clarify,plan,jobs}/route.ts`

- [ ] **4.1** 四个路由开头统一：`const access = await getActiveSessionUser(req.headers); if (!access.ok) return 401 {error:"请先登录"}`。
- [ ] **4.2 jobs route**：删 `PAID_SET_CREDITS`/tier 分支;统一 `shotCount=SHOTS_PER_SET`,`creditsCost=creditsForSet()`;`canUserAfford` 不足 402;审核通过后 `deductCredits(userId, 300, "scene_set", jobId)`;`watermark = watermarkFor({hasSubscription: await hasActiveSubscription(userId)})` 存入 job(经 scenePlan 或新增列;MVP 用 `job.tier` 复用:有订阅="paid" 无="free",orchestrator 据此 watermark)。
- [ ] **4.3** 手动验证：未登录 curl `/api/scene/jobs` → 401；登录后扣 300。
- [ ] **4.4 Commit** `feat(scene): 全流程登录门槛 + 预扣300按张返还`

## Task 5: HEIC 上传兼容

**Files:** Create `lib/image/heic.ts`; Modify `app/api/scene/upload/route.ts`, `package.json`

- [ ] **5.1** `pnpm add heic-convert` (+ `@types/heic-convert` 若有)
- [ ] **5.2 失败测试** `tests/lib/image/heic.test.ts`：`isHeic(buffer)` 用魔数(`ftypheic/ftypmif1/ftypheix`)识别。
- [ ] **5.3 实现 `lib/image/heic.ts`**：`isHeic(buf)` 检查 offset 4–12 的 ftyp brand;`heicToJpeg(buf): Promise<Buffer>` 调 heic-convert(quality 0.92)。
- [ ] **5.4 改 upload route**：放宽类型门(允许 `image/heic`/`image/heif`/空 type+heic 魔数);若 `isHeic` → `heicToJpeg` 后按 `image/jpeg` 存。
- [ ] **5.5 跑测试 + 手动**：传一张 .heic 成功返回 jpg url。
- [ ] **5.6 Commit** `feat(upload): HEIC/Live Photo 兼容转码`

## Task 6: 测试账号脚本

**Files:** Create `scripts/setup-test-user.ts`; Modify `package.json`(script `test-user:setup`)

- [ ] **6.1** 脚本：用 better-auth `hashPassword` 建/更新 `35457311@qq.com` 密码 `dongdong`(emailVerified=true);upsert `subscription`(planKey `yearly`,status `active`,currentPeriodEnd +1y,providerSubId `manual_test`);`user.credits=100000` + `creditLedger` 记一笔 `reason='manual_grant'`;`user.planKey='yearly'`。
- [ ] **6.2** 跑 `pnpm test-user:setup`,登录验证可生成且**无水印**。
- [ ] **6.3 Commit** `chore: 测试账号(年付+10万积分)脚本`

## Task 7: 前端创作流重构（frontend-design）

**Files:** Modify `app/[locale]/create/page.tsx` → 拆 `create/_steps/{Upload,Describe,Clarify,Generating,Result}.tsx` + `create/_components/FrameCell.tsx`; Modify `scene-api.ts`

- [ ] **7.1** 删 `review` step;`FLOW=["upload","describe","clarify"]`;`submitClarify` 内串联 `planScene`→`createSceneJob`→`setStep("generating")`(失败回 clarify 显错)。
- [ ] **7.2 问答分层 + 其他**：问题=带 `Q1` 序号的醒目卡(Fraunces 大字+强调色),选项弱化 pill;每题追加"其他"pill→点击展开 `<input>`,写 `answers[q.id]=自定义文本`;`questionsAnswered` 兼容自定义值非空。
- [ ] **7.3 等待页**：占位底=上传自拍 `selfiePreview` 高斯模糊(`blur-xl scale-110 opacity-40`);阶段话术数组 + 顶部总进度条(90s 均分);逐位虚拟进度(分析→设计→搭建→打磨,到打磨停)接力;真实 `frame.imageUrl` 到 → blur→clear 显影替换并锁定该位。i18n 文案走 `messages`。
- [ ] **7.4 upload accept**：`accept="image/*,.heic,.heif"`,不加 capture。
- [ ] **7.5 frontend-design 走查**：移动端(375px)优先,暗房美学一致。
- [ ] **7.6 Commit** `feat(create): 去review+分层问答+低焦虑等待页`

## Task 8: 定价页三档 + i18n

**Files:** 定价页组件; `messages/{en,zh}.json`; `messages/seo.{en,zh}.json`

- [ ] **8.1** 定价页只展示 weekly/monthly/yearly,`monthly` 标"最受欢迎"高亮;文案用积分口径(1500/8000/10万)。
- [ ] **8.2** 补 `scene.generating.stages`、`scene.clarify.other`、`scene.pricing.*` 中英文案;跑 `pnpm check:forbidden`。
- [ ] **8.3 Commit** `feat(pricing): 三档订阅 + 文案`

## Task 9: 端到端验证

- [ ] **9.1** `pnpm test`(全绿) + `npx tsc --noEmit`(无新增错) + `pnpm lint`。
- [ ] **9.2** 真实跑一组(测试账号):计时首图<35s、全套<70s、6 张、无水印;再用赠送积分号验证带水印 + 扣 300 + 不足返还。
- [ ] **9.3** 移动端 preview 走查 upload/clarify/generating/result。
- [ ] **9.4** 更新 `docs/launch-checklist.md` 对应项状态。

---

## Self-Review

- **Spec 覆盖**:1计费✓(T1/T4) 2上传✓(T5/T7.4) 3问答✓(T7.2) 4去review+等待✓(T7) 5提速✓(T3) 6邮件✓(已写). 测试账号✓(T6).
- **类型一致**:`creditsForSet`/`refundForUndelivered`/`watermarkFor`/`hasActiveSubscription`/`SHOTS_PER_SET` 全程同名。
- **无占位**:关键逻辑含真实代码;UI 细节交 frontend-design(T7.5 走查)。
