# SceneSelf 到上线任务清单（可在新窗口直接接手）

> **本文件自包含**：新会话无需上文上下文，照此执行即可推进到上线。
> 配套：产品规格见 `/Volumes/FZD/开发项目/相册生成调研/SPEC.md`（顶部「v3.1 实现版变更摘要」为准）；
> 实现设计见 `docs/superpowers/specs/2026-06-03-sceneself-v2-adjustments.md`；
> 计划见 `docs/superpowers/plans/2026-06-03-sceneself-v2.md`。
> 约束见 `CLAUDE.md` + `AGENTS.md`（pnpm、计费/积分/订阅/认证是一致性敏感系统）。
> **回复与文档一律用中文。**

---

## 0. 当前状态（v2 已完成并验证）

**已完成**（scene/billing 62 单测绿、tsc 干净仅 10 个 docs 基线、端到端跑通）：

| 模块 | 状态 | 关键文件 |
|---|---|---|
| 积分规则：6 张×50、按未交付返还、水印判定 | ✅ | `lib/scene/pricing.ts`、`tests/lib/scene/pricing.test.ts` |
| 订阅水印判定 `hasActiveSubscription` | ✅ | `lib/billing/subscription-status.ts` |
| 编排提速：逐帧并行 + 完成即揭晓 + 超时降级 + 返还 | ✅ | `lib/scene/orchestrator.ts` |
| 路由登录门槛 + 预扣 300 + 按订阅定水印 | ✅ | `app/api/scene/jobs/route.ts` |
| HEIC/Live Photo 转码 | ✅ | `lib/image/heic.ts`、`app/api/scene/upload/route.ts` |
| 测试账号脚本（年付 + 10 万积分） | ✅ | `scripts/setup-test-user.ts`（`pnpm test-user:setup`） |
| 前端：登录门槛 + 去 review + 分层问答 + 自拍显影等待页 | ✅ | `app/[locale]/create/page.tsx` |
| Resend key 写入 | ✅ | `.env.local` |

**测试账号**：`35457311@qq.com` / `dongdong`（年付订阅、10 万积分、生成无水印），已验证可登录。

**实测性能**：单张 i2i 22–27s、质检 4.8s、6 帧并发不限流；首图 ~30–36s 揭晓、逐张出现。

**本地起服务**：`pnpm dev`（:3000）。质量门：`pnpm test`、`npx tsc --noEmit`、`pnpm lint`、`node scripts/check-forbidden-words.mjs`。

---

## 1. 计费上线配置（需用户提供 Creem 凭据 → 阻塞项）

> v2 有意把「价格表数字 + Creem 绑定」留到此处一次性配齐（连锁触及 webhook/checkout 计费关键路径，无 priceId 无法真支付验证）。积分规则（6×50/返还/水印）已生效，不在此列。

**需用户提供**：`CREEM_API_KEY`、`CREEM_WEBHOOK_SECRET`、在 Creem 后台建好的 3 个订阅产品的 `priceId`。

- [ ] **1.1 重构 `constants/billing.ts` 为三档**：`PlanKey = "weekly" | "monthly" | "yearly"`；`cycle` 类型加 `"week"`；三档 `grantSchedule: { mode: "per_cycle" }`；填 `creemPriceId`。
  - 周付 `priceCents: 299` → `creditsPerCycle: 1500`
  - 月付 `priceCents: 990` → `creditsPerCycle: 8000`（导出 `RECOMMENDED_PLAN = "monthly"`）
  - 年付 `priceCents: 9900` → `creditsPerCycle: 100000`
  - `oneTimePacks` 置空对象（story-pack 下线）。
- [ ] **1.2 连锁更新**（grep `starter_monthly|pro_monthly|pack_200` 定位，全部约 6 处）：
  - `lib/billing-display.ts`（family 配对逻辑改为直接列三档）
  - `lib/account-settings.ts`（switch case 改三档）
  - `features/admin/components/users-table.tsx`（硬编码 plan 列表改三档）
  - `app/api/payments/creem/checkout/route.ts`、`webhook/route.ts`（确保编译；webhook 三档都 `per_cycle` 无分期，注意 `oneTimePacks` 置空后 `isPackKey` 恒 false）
  - 跑 `npx tsc --noEmit` 直到无新增错误。
- [ ] **1.3 定价页**：只展示 weekly/monthly/yearly，月付标「最受欢迎」高亮；文案用积分口径（1500/8000/10 万）。组件在 `components/pricing.tsx` + `app/[locale]/(marketing)/pricing/`。
- [ ] **1.4 Creem webhook**：后台配 `https://sceneself.com/api/payments/creem/webhook`，监听 `checkout.completed`/`subscription.paid`/`subscription.active`；本地用 `CREEM_SIMULATE=true` 或 Creem 测试模式联调一笔，确认订阅 paid → 加积分 + 写 `subscription` 行（status active）→ 该用户生成即无水印。
- [ ] **1.5 切审核 provider**：live payments 前设 `PROMPT_MODERATION_PROVIDER=creem`（见 SPEC 5.2.2，`flag/deny`/超时都 fail closed）。
- [ ] **1.6 i18n**：定价三档中英文案补 `messages/{en,zh}.json` + `seo.{en,zh}.json`；跑 `node scripts/check-forbidden-words.mjs`。

## 2. 邮件（Resend key 已配，需联调）

- [ ] **2.1 验证发件域名** `dzqjiaju.com`：在 Resend 后台加 DNS（SPF/DKIM），否则进垃圾箱/被拒。
- [ ] **2.2 注册邮箱验证**：在 `lib/auth.ts` 的 Better Auth 配置加 `emailVerification.sendVerificationEmail` 回调，用 `lib/email.ts`（Resend）发信；token 24h 过期；提供「重新发送」。当前注册即送积分但未强制验证，按 SPEC 8.2「保存/导出时要求验证」或注册即验证，二选一实现。
- [ ] **2.3 营销 opt-in**：注册表单加独立 marketing 勾选（与账号验证分开）；营销邮件含退订链接、退订状态持久化（SPEC 8.3）。事务邮件不受退订影响。

## 3. 合规（上线门槛，SPEC 第 9 节，不完成不算完工）

- [ ] **3.1 法律页复核**：`app/[locale]/(marketing)/{privacy,terms,refund,cookie}/`。Privacy 已含人脸数据节（采集目的限定/不训练/24h 删除/火山处理方/BIPA·GDPR）+ 个人开发者版（中国大陆、email 联系）。复核 ToS/Refund 与三档订阅一致（可取消、不暗扣）。
- [ ] **3.2 人脸自动删除**：已实现（job 完成 `repo.purgeIdentity` 清 selfie+identity）；确认 `SELFIE_RETENTION_HOURS` 兜底定时清理已配（cron 或火山生命周期）。
- [ ] **3.3 复跑** `node scripts/check-forbidden-words.mjs` + `pnpm build`（build 内置禁词扫描）。

## 4. 质量阈值校准（建议上线前，需样张）

- [ ] **4.1 多族裔真人样张**校准 `QUALITY_MIN` / `IDENTITY_THRESHOLD` / `SET_QUALITY_MIN`（env，见 `lib/scene/config.ts`）。当前默认 quality≥3、identity 0.6 较宽松；真人自拍 same_person 通过率高，但需多族裔验证避免误杀。
- [ ] **4.2（正式版）IdentityCheck 切火山人脸比对 API**：`IDENTITY_CHECK_PROVIDER=volcano_face`，实现 `lib/scene/services/identity-check.ts` 的 volcano_face 分支（SPEC 1.4，主流程零重构，已留 provider 开关）。收费用户对「不像」零容忍。

## 5. 部署（纯 Vercel Pro/Fluid）

- [ ] **5.1 环境变量**：生产 `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `RESEND_FROM_EMAIL` 用 `sceneself.com`；火山 / R2(`STORAGE_*`) / Neon / Creem / Resend / `CRON_SECRET` 全配齐。
- [ ] **5.2 数据库**：`pnpm db:push` 到生产 Neon（generation_job/generation_frame 等迁移）。
- [ ] **5.3 cron**：三档订阅均 `per_cycle`（无分期），`subscription-grants` cron 非必需；若后续加年付分期再配 `/api/cron/subscription-grants`（`CRON_SECRET`）。
- [ ] **5.4 管理员**：`ADMIN_EMAIL=you@example.com pnpm admin:setup`。
- [ ] **5.5 Vercel**：Pro + Fluid Compute（函数超时 300s）；成品走 R2/CDN（已实现 `uploadImageFromUrl` 无 R2 自动降级）。

## 6. 可选优化（非上线门槛，体验加分）

- [ ] `/board` 我的作品集页（SPEC 第 7 节 `My Stories`：历史 job 网格 + 重看/分享/换一张）。
- [ ] `UploadGate` 上传质量闸（清晰正脸/光照/分辨率提示重传，SPEC 5.1）；建议引导传 2–3 张提升一致性。
- [ ] 9:16 社媒全屏导出（4:5 垫模糊背景，SPEC 0 节）。
- [ ] 真人脸端到端复测：传真人自拍验证 6/6 交付率 + 首图/全套计时 + 无水印（测试账号）。
- [ ] 单帧「换一张」重跑（`POST /api/scene/frames/:id/regenerate`，SPEC 5.10）。

---

## 7. 给接手者的注意事项

- **计费/积分/订阅/认证是一致性敏感系统**（AGENTS.md）：改动用 TDD，预扣→审核→扣减顺序不能乱；审核不过不创建 job、不扣分。
- **出图别回退组图串行**：实测 `sequential_image_generation` 4 张 131s，会超 Vercel 300s；保持逐帧并行 + 完成即揭晓（`lib/scene/orchestrator.ts` 的 `runGeneration`）。
- **质检视觉用 /responses API + 关思考**（`lib/volcano-engine/vision.ts`），不是 /chat/completions。
- **项目目录不是 git 仓库**（`/Volumes` 外置盘）：无法 commit，用测试 + tsc + 手动验证作质量门。
- **敏感凭据在 `.env.local`**（火山 key、R2、Neon、Resend），勿外泄、勿写进可提交文件。
- **禁词红线**：全站文案无 `fake/deceive/catfish/proof/假装/骗`，`pnpm build` 会扫描。
