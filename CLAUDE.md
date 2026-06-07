# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 📎 仓库根还有一份 [AGENTS.md](AGENTS.md),里面是"ground rules"(底线 / 不变量 / 易踩坑点),给所有 AI 编程工具用。两份文档互补:本文件偏架构与命令,AGENTS.md 偏底线与约束 — **修改前请同时参考**。

## 项目概览

**SceneSelf** 是一个 **AI 场景照片集生成器**——用户上传一张自拍 + 一句话场景描述,产出一组 6 张电影级、竖版 (4:5)、风格统一的写真照片(例:旅行九宫格、节日大片、幻想角色集锦等)。

底层是一套生产级 Next.js SaaS 模板,所以整套基础设施(认证 / 计费 / 后台 / i18n / 邮件 / 分析)都齐了,但**主流程是 Scene 生成**,不是通用 chat/image/video demo——后者只在 `/demo` 演示页保留。

**核心特性**:
- ✅ **Scene 生成主流程**:一句话 → 场景规划 → 上传自拍 → 6 张一致风格写真(`/create` 页 + `lib/scene/` 引擎 + `/api/scene/*`)
- ✅ 完整的用户认证 (Better Auth + 可选 Google OAuth)
- ✅ 基于积分的计费 + 三档订阅 (Creem 支付集成)
- ✅ **兑换码系统**(admin 批量生成 + partner API + 用户端 `/redeem`)
- ✅ 管理后台(用户 / 订阅 / 积分 / 兑换码批次 / API key)
- ✅ 国际化(中英)
- ✅ 内置文档站(Fumadocs)+ 博客 + 邮件(Resend)+ 分析工具

> 旧 SaaS 模板里的 `/demo` 演示页(chat / image / video)和火山引擎集成**已全部下线**,不再支持。

## 技术栈

### 前端
- **框架**: Next.js 16.2.2 (App Router) + React 19
- **样式**: Tailwind CSS v3 + Framer Motion
- **UI 组件**: 自定义组件 + Radix UI(shadcn 风格)
- **表单**: React Hook Form + Zod 4
- **主题**: next-themes
- **国际化**: next-intl(动态路由 `[locale]`,默认语言 `as-needed`)
- **文档站**: Fumadocs(MDX + 自动 i18n)

### 后端
- **认证**: Better Auth 1.5 + Drizzle adapter(邮箱密码 + 可选 Google OAuth)
- **数据库**: PostgreSQL + Drizzle ORM 0.44
- **支付**: Creem(订阅 + 一次性,目前只用订阅;一次性 pack 已下线)
- **AI provider**: **OpenRouter 唯一** —— Scene 流程全部走 OpenRouter
  - 出图: `google/gemini-3.1-flash-image-preview`(Nano Banana 2,~$0.067/图)
  - 文本(场景规划/翻译/澄清问答): `google/gemini-3.1-flash-lite-preview`
  - 视觉(质检/组一致性/身份粗判): 同上
  - face-swap 兜底接口([lib/scene/services/face-swap.ts](lib/scene/services/face-swap.ts))为预留 stub,目前返回 null(坏帧直接 drop)
- **邮件**: Resend
- **存储**: Cloudflare R2 (S3 兼容,`lib/r2-storage.ts`)
  - 生成图镜像 R2;失败时回退到 provider URL

### 开发工具
- **类型**: TypeScript strict
- **测试**: Vitest 4 + Testing Library + jsdom
- **Lint**: ESLint 9
- **包管理**: pnpm 10

## 项目结构

```
├── app/[locale]/
│   ├── (auth)/                # 登录、注册、忘密、重置密码
│   ├── (marketing)/           # 首页、定价、博客、联系、隐私、退款、cookies、terms
│   ├── (protected)/           # 仪表板、profile、settings、credits(需登录)
│   ├── (admin)/               # 用户、订阅、积分、兑换码批次、API key 管理(需 admin)
│   ├── create/                # ★ Scene 生成主流程页(产品核心 UI)
│   ├── docs/                  # Fumadocs 文档站
│   ├── check-email/           # 注册后引导验证邮箱
│   └── verify-email/          # 邮件链接打开的验证成功页
├── app/api/
│   ├── auth/                  # Better Auth 路由 + 自定义(forgot/reset/verify/resend)
│   ├── scene/                 # ★ Scene 主流程: plan / clarify / upload / jobs
│   ├── payments/creem/        # checkout + webhook + redirect-placeholder
│   ├── redeem/                # 用户兑换码核销
│   ├── partner/codes/         # 合作伙伴 API:批量生成兑换码(API key 鉴权)
│   ├── admin/                 # 用户/积分/订阅/兑换码批次/API key 后台
│   ├── user/                  # profile / credits/history / admin-status
│   ├── upload/                # image 上传(R2) + simple(demo)
│   ├── newsletter/            # subscribe + unsubscribe
│   ├── contact/               # 联系表单
│   └── cron/                  # subscription-grants + cleanup-selfies
├── lib/
│   ├── auth.ts                # Better Auth 配置 + 注册赠送 300 积分 hook
│   ├── auth/                  # session / admin / google-auth(可选)
│   ├── db/                    # 连接 + schema
│   ├── scene/                 # ★ Scene 引擎(下面单独展开)
│   ├── credits.ts             # 积分扣 / 退 / 余额
│   ├── credit-compensation.ts # 失败补偿(provider 调用失败自动退还积分)
│   ├── redemption/            # 兑换码 CRUD + 核销 + API key 管理
│   ├── billing/               # 订阅状态 + 周期发放调度
│   ├── payments/creem.ts      # checkout + webhook 验签
│   ├── openrouter/            # OpenRouter SDK 封装(chat/image/config/types)
│   ├── r2-storage.ts          # 上传到 R2 + 兜底回退 provider URL
│   ├── image/heic.ts          # iOS HEIC 转 JPEG
│   ├── email.ts               # Resend 模板和发送
│   ├── landing/showcase-sets.ts # 首页 showcase 数据
│   ├── docs-*.ts              # Fumadocs 元数据 / 目录树
│   └── blog-manifest.generated.ts # 构建期生成,勿手改
├── lib/scene/                 # ★★ Scene 引擎(核心新业务模块)
│   ├── types.ts               # 所有领域类型(JobStatus/ScenePlan/ShotSpec/Storyline...)
│   ├── orchestrator.ts        # 三道及格线状态机(像 + 真 + 组一致)+ 候选/救援/封面
│   ├── scene-plan.ts          # ScenePlan 校验、遮挡检测、prompt 装配
│   ├── prompts.ts             # 所有 LLM 提示词模板
│   ├── pricing.ts             # 每组 6 张 × 50 积分,未交付按张返还
│   ├── repository.ts          # generation_job / generation_frame 的 DAL
│   ├── config.ts              # 模型 / 阈值 / provider 切换(全部 env 可覆盖)
│   └── services/
│       ├── scene-planner.ts        # 场景规划 LLM 调用
│       ├── story-line.ts           # 故事线生成(剧情梗概)
│       ├── intent-rewriter.ts      # 意图改写(proof→editorial 等)
│       ├── prompt-moderation.ts    # 内容审核(local/llm/creem 三种 provider)
│       ├── translation.ts          # 多语言翻译(中文 prompt → 英文出图)
│       ├── image-gen.ts            # 出图(OpenRouter 封装)
│       ├── image-inline.ts         # URL ↔ base64 转换
│       ├── face-check.ts           # 人脸检测 + 质量
│       ├── identity-check.ts       # 自拍 vs 出图人物一致性(vlm,OpenRouter)
│       ├── quality-check.ts        # 单帧质量(像 + 真)
│       ├── set-coherence-check.ts  # 组一致性(衣服/光感/重复构图)
│       └── face-swap.ts            # 人脸交换兜底接口(stub,返回 null)
├── features/                  # 功能模块化的 UI
│   ├── auth/                  # 表单 + session-guard + email-verified-guard
│   ├── forms/                 # 通用表单壳子
│   ├── navigation/            # 顶部 / 移动导航 + user-menu
│   ├── marketing/             # 联系表单
│   └── admin/
│       ├── components/
│       │   ├── admin-dashboard / sidebar / header
│       │   ├── users-table / credits-table / subscriptions-table
│       │   └── redemption/
│       │       ├── codes-page.tsx          # 兑换码批次列表 + 新建批次
│       │       ├── batch-detail-page.tsx   # 单批次详情 + 导出
│       │       └── api-keys-page.tsx       # partner API key 管理
│       └── actions/user-actions.ts        # admin Server Actions
├── components/
│   ├── scene-chrome/          # Scene 系列页面框架(navbar / footer / shell / promo-aside)
│   ├── ui/                    # shadcn 风格通用组件库
│   └── 其余 marketing 与通用组件(hero/pricing/features/testimonials...)
├── layouts/                   # scene-auth-layout 等大模板
├── constants/
│   ├── billing.ts             # 三档订阅(weekly/monthly/yearly),pack 已下线
│   ├── website.ts             # 站点 + 文档配置
│   └── scene-storylines.ts    # Scene 故事线预设
├── content/docs/              # Fumadocs MDX 源文件(中英双语)
├── messages/                  # next-intl 翻译(en/zh + seo)
├── tests/{components,constants,lib}/  # Vitest 测试
├── scripts/                   # 工具脚本(run-dev / setup-admin / sync-fumadocs-style 等)
└── drizzle/                   # 数据库迁移文件
```

## 核心业务流程

### ⭐ 1. Scene 生成主流程(产品核心)

入口页: [app/[locale]/create/page.tsx](app/[locale]/create/page.tsx)
状态机: `draft → planning → awaiting_choices → generating → completed | partial | failed`
数据落库: `generation_job`(任务)+ `generation_frame`(单帧),见 [lib/db/schema.ts:209](lib/db/schema.ts)。

**完整链路**:

1. **意图改写 + 审核**(`/api/scene/clarify`)
   - `IntentRewriter` 把不安全口径改成安全的 editorial 版(`proof_to_editorial` / `ownership_to_lifestyle` / 等)
   - `PromptModeration` 三选一 provider(`local` / `llm` / `creem`)做内容审核
   - 输出消歧问题(选择题,不打字)

2. **ScenePlan 生成**(`/api/scene/plan`)
   - 走 OpenRouter 文本模型(Gemini Flash Lite)
   - 产出 `ScenePlan`:scenario / cluster / coherence_type / continuity(衣服/配饰/发型/首饰/鞋子/相机/film_look 全部锁定)+ 6 个 `ShotSpec`(每帧独立的 narrative_role、shot_size、expression_beat、image_prompt)
   - 锚定物体(helicopter / Ferrari 等)走 `anchor_object` 字段强制锁定颜色和识别标记

3. **自拍上传**(`/api/scene/upload`)
   - HEIC 自动转 JPEG([lib/image/heic.ts](lib/image/heic.ts))
   - 上传到 R2(无 R2 时回退 data URL)
   - 写入 `generation_job.selfieUrl` + `identityRef`(临时,按 `SELFIE_RETENTION_HOURS` 清理,默认 24h)

4. **编排出图**([lib/scene/orchestrator.ts](lib/scene/orchestrator.ts))
   - **三道及格线**:
     - ① **像**:`QualityCheck`(deformity / plastic_skin / 整体 quality ≥ `QUALITY_MIN`,默认 3)
     - ② **真**:`IdentityCheck`(same_person;质量足够高时允许 override,避免 vision LLM 误判)
     - ③ **组一致**:`SetCoherenceCheck`(outfit / style / coherence_type / 不重复构图)
   - **多候选**:单帧最多 `SCENE_MAX_CANDIDATES` 次重抽(默认 1)
   - **救援**:dropped 帧用已 passed 帧作 reference 再救 `SCENE_RESCUE_ATTEMPTS` 次(默认 2)
   - **face-swap 兜底接口**:像不像但其他都过 → 调 `swapFace()`(目前是 stub,返回 null;接通后能再救一批 dropped 帧)
   - **salvage**:最低质量门槛 `SALVAGE_QUALITY_MIN`,保证 6/6 交付
   - **reference chaining**(默认开):先串行出第 1 帧作"组内视觉锚",其余帧带它做 reference 并发出图,大幅提升衣服色/anchor 内饰色的组一致性

5. **任务查询**(`/api/scene/jobs/[id]`):前端轮询拿状态和帧 URL,封面优先回流

### 2. 用户注册与积分赠送

- 邮箱密码 / Google OAuth 注册
- 注册成功后通过 Better Auth `after` hook 自动赠送 **300 积分**([lib/auth.ts:74-92](lib/auth.ts))
- 记到 `credit_ledger`,reason = `registration_bonus`
- 邮箱验证非强制登录(`requireEmailVerification: false`),但**保存/导出场景集时校验** `emailVerified`

### 3. 积分系统

核心: [lib/credits.ts](lib/credits.ts) + [lib/credit-compensation.ts](lib/credit-compensation.ts)

**两个事实来源**:
- `user.credits` —— 快查余额
- `credit_ledger` —— 审计账本(每次变动都记一行,可追溯)

**Scene 计费**(见 [lib/scene/pricing.ts](lib/scene/pricing.ts)):
- 每组固定 **6 张 × 50 积分 = 300 积分/组**
- **预扣全额**,生成结束按未交付张数返还(`refundForUndelivered`)
- **水印**:有有效订阅 → 无水印;只靠注册积分(无订阅)→ 带水印

**Demo 路由已下线**。原本 chat/image/video demo 用的 `createCreditCompensation(...)` 模式仍保留在 [lib/credit-compensation.ts](lib/credit-compensation.ts),如未来加新的付费 AI 路由,应沿用该模式做失败补偿。

### 4. 订阅与支付(Creem)

**三档订阅**(见 [constants/billing.ts](constants/billing.ts),一次性 pack 已下线):

| Plan | 价格 | 积分 | 周期 | 发放模式 |
|------|------|------|------|---------|
| `weekly` | $2.99 | 1500 | 周 | `per_cycle`(每周期一次性发) |
| `monthly` ⭐ 推荐 | $9.90 | 8000 | 月 | `per_cycle` |
| `yearly` | $99.00 | 100000 | 年 | `per_cycle` |

> ⚠️ 旧文档里的 `starter_monthly` / `pro_monthly` / `pack_200` 都已下线,**不要再引用**。
> ⚠️ `grantSchedule.mode = "installments"` 类型还在 [constants/billing.ts](constants/billing.ts) 保留(供未来扩展),但当前三档都是 `per_cycle`,**年付不再分 12 期发放**。

**支付链路**:
1. 前端调 `/api/payments/creem/checkout` → 创建 Creem session(`metadata` 带 `userId` / `key` / `kind`)
2. 用户付款 → Creem webhook 打到 `/api/payments/creem/webhook`
3. Webhook 处理([app/api/payments/creem/webhook/route.ts](app/api/payments/creem/webhook/route.ts)):
   - ✅ HMAC 验签
   - ✅ 幂等(用 `providerPaymentId`)
   - ✅ 插入 `payment` 记录
   - ✅ 创建/更新 `subscription` 记录
   - ✅ 发放积分到 `user.credits` + `credit_ledger`
   - ✅ 写 `subscription_credit_schedule`(供 cron 续期发放)
   - ✅ 发购买确认邮件
4. Cron `/api/cron/subscription-grants` 周期发放新一个 cycle 的积分

### 5. ⭐ 兑换码系统(新)

**数据表**(见 [lib/db/schema.ts:273-306](lib/db/schema.ts)):
- `redemption_code`:12 位大写 code(字符集去掉 `0/O/1/I/L`),记 batchId / credits / channel / usedBy / usedAt / createdBy
- `partner_api_key`:合作伙伴 API key,**仅在创建时返回明文,DB 只存 sha256 hash**,前 8 位作识别,每天有 `dailyLimit` 配额

**入口**:
- 用户端: `POST /api/redeem` —— 大小写不敏感(DB 存大写),一码一用
- Admin: `/admin/codes`(批次列表)+ `/admin/codes/[batchId]`(批次详情)
- Admin 创建批次: `POST /api/admin/codes`
- Admin 管 API key: `/admin/api-keys`
- Partner 自助生成: `POST /api/partner/codes`(Bearer API key 鉴权)

**目前不实现**: 仅限新用户 / 过期时间(`expiresAt` 字段已留)

### 6. 管理后台

通过 `user.role = 'admin'` 标识。Guard 在 [features/auth/components/session-guard.tsx](features/auth/components/session-guard.tsx) 和 admin 路由组里。

**已实现页面**:
- 用户管理: `app/[locale]/(admin)/admin/users` —— 查询 + 改积分 + 改订阅
- 订阅管理: `app/[locale]/(admin)/admin/subscriptions`
- 积分账本: `app/[locale]/(admin)/admin/credits`
- **兑换码批次**: `app/[locale]/(admin)/admin/codes` + `[batchId]` 详情
- **Partner API key**: `app/[locale]/(admin)/admin/api-keys`

**创建管理员**: `pnpm admin:setup`(交互式,见 [scripts/setup-admin.ts](scripts/setup-admin.ts))

## 常用开发命令

```bash
# 启动开发服务器(scripts/run-dev.mjs 包装;先自动同步 fumadocs 样式)
pnpm dev                # 默认自适应
pnpm dev:turbopack      # 强制 Turbopack
pnpm dev:webpack        # 强制 Webpack(Turbopack 卡的兜底)

# 构建与启动
pnpm build              # 先 check-forbidden-words + generate:blog-manifest + next build
pnpm start

# 检查
pnpm lint
pnpm check:forbidden    # 单独跑敏感词检查(build 内置)

# 测试(Vitest + Testing Library + jsdom)
pnpm test               # 一次性
pnpm test:watch
pnpm test:coverage
pnpm test path/to/file
pnpm test -t "用例名"

# 数据库
pnpm db:generate
pnpm db:migrate
pnpm db:push            # 开发环境推 schema
pnpm db:studio

# 工具
pnpm admin:setup        # 设管理员
pnpm test-user:setup    # 创测试用户

# 内容/资源
pnpm generate:blog-manifest    # build 时自动调
pnpm sync:fumadocs-style       # predev/prebuild 自动调
```

> ⚠️ `public/fumadocs-style.css` 由 `sync:fumadocs-style` 生成,**禁止手写编辑**。
> ⚠️ `lib/blog-manifest.generated.ts` 由 `generate:blog-manifest` 生成,**禁止手写编辑**。
> ⚠️ `pnpm build` 会先跑 `scripts/check-forbidden-words.mjs` —— 敏感词命中会**中断构建**。

## 环境变量

完整清单见 [.env.example](.env.example)。**必需**:

```env
# 数据库
DATABASE_URL="postgresql://..."

# Auth
BETTER_AUTH_SECRET="32 字符以上"
BETTER_AUTH_URL="http://localhost:3000"

# Google OAuth(可选;同时给两个值才显示 Google 按钮)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# ★ Scene 主流程必需:OpenRouter
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_API_URL="https://openrouter.ai/api/v1"
OPENROUTER_IMAGE_MODEL="google/gemini-3.1-flash-image-preview"
OPENROUTER_TEXT_MODEL="google/gemini-3.1-flash-lite-preview"
OPENROUTER_VISION_MODEL="google/gemini-3.1-flash-lite-preview"
OPENROUTER_IMAGE_SIZE="1024px portrait 4:5"

# Scene 参数
QUALITY_MIN="3"
SET_QUALITY_MIN="3"
IDENTITY_THRESHOLD="0.6"
SCENE_MAX_CANDIDATES="1"      # 单帧最多重抽次数
SCENE_RESCUE_ATTEMPTS="2"     # dropped 帧救援次数
SCENE_REFERENCE_CHAINING="true"   # 串行第 1 帧作锚
SELFIE_RETENTION_HOURS="24"   # 自拍清理时限
SCENE_DEV_FALLBACK="true"     # 无 key 时返回占位图

# Scene provider 切换
# 代码默认 llm(本地不显式设也走 llm,见 lib/scene/config.ts:31)。
# - llm: ★ 用 OpenRouter Gemini Flash Lite 做语义审核,推荐
# - local: 英文正则关键词,中文/变体全漏,只 dev 偷懒,上线必须避开
# - creem: 占位,Creem 自家 API 没发布,选了会 fail closed 拒绝所有 prompt
PROMPT_MODERATION_PROVIDER="llm"

# 支付(必需,真上线用)
CREEM_API_KEY="..."
CREEM_WEBHOOK_SECRET="whsec_..."
CREEM_API_BASE="https://api.creem.io"
# CREEM_SIMULATE="true" 跳过真实支付(测试用)
# 三档订阅各自的 Creem priceId
CREEM_WEEKLY_PRICE_ID=""
CREEM_MONTHLY_PRICE_ID=""
CREEM_YEARLY_PRICE_ID=""

# 邮件(必需)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="SceneSelf <noreply@yourdomain.com>"
RESEND_AUDIENCE_ID=""   # 可选,newsletter 用

# Cron 鉴权(Basic Auth 或 Bearer 二选一)
CRON_JOBS_USERNAME=""
CRON_JOBS_PASSWORD=""
CRON_SECRET=""

# 应用 URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 存储(可选,未配置时上传走 data URL,出图镜像回退到 provider URL)
STORAGE_REGION=""
STORAGE_BUCKET_NAME=""
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
STORAGE_ENDPOINT="https://example.r2.cloudflarestorage.com"
STORAGE_PUBLIC_URL="https://cdn.yourdomain.com"

# 分析(可选)
NEXT_PUBLIC_POSTHOG_KEY=""
NEXT_PUBLIC_POSTHOG_HOST=""
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=""
NEXT_PUBLIC_CLARITY_PROJECT_ID=""

# Feature flags
NEXT_PUBLIC_ENABLE_CHAT="false"
NEXT_PUBLIC_MAINTENANCE_MODE="false"
```

## 数据库架构(核心表)

```sql
-- 用户与认证
user (id, email, name, image, credits, role, planKey, banned, banReason, banExpires, ...)
session (id, userId, token, expiresAt, ipAddress, userAgent, ...)
account (id, userId, providerId, accessToken, refreshToken, password, ...)
verification (id, identifier, value, expiresAt, ...)

-- 支付与订阅
payment (id, provider, providerPaymentId, userId, amountCents, status, type, planKey, creditsGranted, raw, ...)
subscription (id, provider, providerSubId, userId, planKey, status, currentPeriodEnd, raw, ...)
credit_ledger (id, userId, delta, reason, paymentId, createdAt)
subscription_credit_schedule (id, subscriptionId, userId, planKey, creditsPerGrant, intervalMonths, grantsRemaining, totalCreditsRemaining, nextGrantAt, ...)

-- ★ Scene 主流程
generation_job (id, userId?, status, rawPrompt, safePrompt, rewriteApplied, rewriteReason,
                moderationStatus, moderationReason, scenePlan jsonb, selfieUrl, identityRef jsonb,
                shotCount, aspectRatio, creditsCost, tier, createdAt, completedAt, ...)
generation_frame (id, jobId, index, shotSpec jsonb, status, imageUrl,
                  identityScore, qualityScore, failReason, candidatesTried, isCover, ...)

-- ★ 兑换码系统
redemption_code (code PK(12), batchId, credits, channel, usedBy?, usedAt?, createdBy, expiresAt?, ...)
partner_api_key (id, name, keyHash(sha256), keyPrefix(8), dailyLimit, codesToday, todayResetsAt, totalGenerated, deactivated, ...)

-- 其他
password_reset_token (id, userId, token, expiresAt)
newsletter_subscription (id, email, userId?, status, unsubscribeToken, subscribedAt, ...)

-- ⚠️ 历史遗留表（不再写入，下次 db:push 会被 DROP，里面如有测试数据请先备份）
-- chat_session / chat_message / generation_history —— 旧 demo 用，已下线
```

完整 schema: [lib/db/schema.ts](lib/db/schema.ts)。

## 国际化

- 框架: `next-intl`
- 语言: `en` / `zh`
- 翻译: [messages/en.json](messages/en.json) / [messages/zh.json](messages/zh.json) / [messages/seo.en.json](messages/seo.en.json) / [messages/seo.zh.json](messages/seo.zh.json)
- 路由策略: `as-needed` —— 英文(默认)路径是 `/docs`、`/pricing`、`/login`;中文是 `/zh/docs` 等
- 路由拦截: [proxy.ts](proxy.ts)
- 配置: [i18n.config.ts](i18n.config.ts)

**新增/修改用户可见文案时必须中英都改**(除非任务明确说只改一种)。

## 文档站

- 由 Fumadocs 驱动,入口 `/docs`(英)和 `/zh/docs`(中)
- MDX 源: [content/docs/](content/docs/)
- [lib/source.ts](lib/source.ts) 读 `fumadocs-mdx` 生成的 `.source/*`
- 样式: `public/fumadocs-style.css` 由 `pnpm sync:fumadocs-style` 生成,**不要手改**

## 路由权限

- **公开**: `(marketing)`, `(auth)`, `docs`, `check-email`, `verify-email`
- **登录后**: `(protected)` —— 通过 [features/auth/components/session-guard.tsx](features/auth/components/session-guard.tsx)
- **需邮箱验证**: `(protected)` 内通过 [features/auth/components/email-verified-guard.tsx](features/auth/components/email-verified-guard.tsx) 进一步拦截关键动作
- **管理员**: `(admin)` —— `user.role = 'admin'`
- **/create**: 可匿名启动一次免费 Scene(看到结果前才提示注册)—— 见 `generation_job.userId` 是 nullable

## 安全机制

1. **Webhook 验签**: Creem HMAC-SHA256([lib/payments/creem.ts](lib/payments/creem.ts))
2. **支付幂等**: `providerPaymentId` unique
3. **Cron 鉴权**: Bearer `CRON_SECRET` 或 Basic Auth(`CRON_JOBS_USERNAME` + `CRON_JOBS_PASSWORD`)
4. **Partner API key**: DB 只存 sha256 hash,明文仅创建时返回一次,前 8 位识别
5. **兑换码字符集**: 去掉 `0/O/1/I/L`,12 位大写,unique
6. **自拍隐私**: `selfieUrl` + `identityRef` 按 `SELFIE_RETENTION_HOURS` 由 `/api/cron/cleanup-selfies` 清理
7. **Prompt 审核**: `PROMPT_MODERATION_PROVIDER` —— 代码默认 `llm`(OpenRouter Gemini 语义审核,推荐);`local` 仅英文正则,只 dev 偷懒;`creem` 是占位(Creem API 未发布,选了会拒绝所有 prompt)
8. **内容改写**: `IntentRewriter` 把不安全口径自动改成 editorial 版,而非硬拒
9. **用户封禁**: `user.banned` + `banReason` + `banExpires`
10. **敏感词**: build 时跑 [scripts/check-forbidden-words.mjs](scripts/check-forbidden-words.mjs) 兜底

## 部署清单

### 1. 环境准备
- [ ] PostgreSQL(Supabase / Neon / Vercel Postgres)
- [ ] **OpenRouter API key**(Scene 主流程必需)
- [ ] Creem 账号 + API key + webhook secret
- [ ] Resend API key + 验证发件域名
- [ ] (可选) Google OAuth
- [ ] (可选) Cloudflare R2 / S3 兼容存储

### 2. 数据库
```bash
pnpm db:push  # 首次
# 或
pnpm db:migrate  # 用迁移文件
```

### 3. Creem 配置
- 后台建好 weekly / monthly / yearly 三档产品,把 priceId 写入对应环境变量
- Webhook URL: `https://your-domain.com/api/payments/creem/webhook`
- 监听事件: `checkout.completed`, `subscription.paid`, `subscription.active`
- **确认 `PROMPT_MODERATION_PROVIDER` = `llm`**(代码默认就是,但 `.env` 显式覆盖了要改回);**不要**切 `local`(英文正则,中文/变体全漏,Creem 商户审核会因"无内容过滤机制"被拒);**不要**切 `creem`(Creem 自家 moderation API 还没发布,选了会 fail closed 拒绝所有 prompt)

### 4. Cron
每小时打:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/subscription-grants
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/cleanup-selfies
```

### 5. 管理员账户
```bash
pnpm admin:setup
```

### 6. 检查清单
- [ ] `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `RESEND_FROM_EMAIL` 使用生产域名
- [ ] R2 配置好(否则上传走 data URL,出图不会镜像到 R2)
- [ ] `SCENE_DEV_FALLBACK="false"`(生产应禁占位图)

## 自定义指南

### 改 Scene 计费
[lib/scene/pricing.ts](lib/scene/pricing.ts):
- `SHOTS_PER_SET = 6`
- `CREDITS_PER_PHOTO = 50`

### 改订阅档位
[constants/billing.ts](constants/billing.ts):改价格 / 积分 / Creem priceId。**不要随便加新 plan key**,前端导航和 webhook 都依赖现有 key。

### 改 Scene 质量阈值
[lib/scene/config.ts](lib/scene/config.ts) 全部 env 可覆盖;调阈值前用目标市场多族裔样张校准。

### 换 AI provider
Scene 主流程目前**强绑定 OpenRouter**(Nano Banana 2 + Gemini Flash Lite 是当前性价比最优组合)。换 provider 需要:
1. 改 [lib/openrouter/](lib/openrouter/) 或新建 `lib/<provider>/`
2. 改 [lib/scene/services/image-gen.ts](lib/scene/services/image-gen.ts)、`quality-check.ts`、`identity-check.ts`、`scene-planner.ts`、`story-line.ts`
3. 改 [lib/scene/config.ts](lib/scene/config.ts) 里的 `imageModel` / `textModel` / `visionModel`

### 添加新语言
1. 复制 `messages/en.json` + `messages/seo.en.json`
2. 翻译
3. 更新 [i18n.config.ts](i18n.config.ts) / [proxy.ts](proxy.ts) / docs i18n

## 故障排查

### Scene 生成质量翻车
1. 检查 `SCENE_REFERENCE_CHAINING=true`(关了组一致性会大幅下降)
2. 看 `generation_frame.failReason` —— `identity` 占多数说明 `IDENTITY_THRESHOLD` 太严
3. 看是否 `SCENE_DEV_FALLBACK=true` 导致返回的是占位图
4. 出图模型 ID 必须是 OpenRouter 兼容的(`google/...`)
5. anchor 物体不锁就会变形 —— 检查 `ScenePlan.continuity.anchor_object`

### 6 张没收齐
- `generation_job.status = "partial"` 时,看 `creditsCost` 是否已按未交付张数返还(`refundForUndelivered`)
- 救援 + salvage 联动应该能保 6/6,如果稳定丢帧看 `SCENE_RESCUE_ATTEMPTS` 是不是 0

### Webhook 没触发
1. Creem 后台 URL 正确
2. 验签通过(`CREEM_WEBHOOK_SECRET` 匹配)
3. 看是不是同一 `providerPaymentId` 被拒(幂等命中)

### 年付积分?
**已不分期发放**,三档全部 `per_cycle`。年付一次性给 100000,新一年由 Creem 续订续发(走 webhook + cron)。

### 兑换码核销失败
1. 大小写:DB 存大写,前端可输小写,会自动转
2. 一码一用:看 `used_by` 是不是已经填了

## 相关文档

- 用户可见文档: [content/docs/](content/docs/) → 上线后访问 `/docs`、`/zh/docs`
- 底线规则: [AGENTS.md](AGENTS.md)
- 项目结构(站内): [content/docs/project-structure.mdx](content/docs/project-structure.mdx)
- 环境变量(站内): [content/docs/environment.mdx](content/docs/environment.mdx)
- 部署(站内): [content/docs/deployment.mdx](content/docs/deployment.mdx)
- 自定义(站内): [content/docs/customization.mdx](content/docs/customization.mdx)
- 故障排查(站内): [content/docs/troubleshooting.mdx](content/docs/troubleshooting.mdx)
- Better Auth: https://better-auth.com/
- Drizzle ORM: https://orm.drizzle.team/
- OpenRouter: https://openrouter.ai/docs
- Creem: https://docs.creem.io/
