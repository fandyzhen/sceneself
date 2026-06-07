# SceneSelf 实现设计文档（蓝图）

> 基于 `相册生成调研/SPEC.md`（定稿 v3），在既有 Next.js 模板基础（当前 `Sceneself` 目录）上扩展的 AI 场景照片集生成器（路径 B）。
> 本文件是整个项目的实现蓝图与阶段计划，兼作第一阶段的实现清单。
> 日期：2026-06-03。

---

## 0. 已与用户对齐的关键决策

1. **端到端竖切优先**：第一份计划打通一条最小可跑链路（上传→一句话→改写/审核→ScenePlanner→Seedream 出 4 张→质检→看结果），尽早验证架构假设。
2. **key 很快给、不做完整 mock**：重心放在"搭骨架 + 可替换接口"，开发期留最小 dev fallback（无 key 时出图返回占位图，让前端流程能演示）；纯逻辑（改写规则、`scene_plan` 校验、编排状态机）写 Vitest 单测。
3. **MVP 边界（接口预留、暂不实做）**：
   - `IdentityCheck` MVP 用豆包视觉，正式版无缝切火山人脸 API。
   - `PromptModeration` MVP 用 local provider，Creem live payments 前切 Creem Moderation API。
   - 纯 Vercel 单函数，不引入 QStash/Inngest 队列。
   - `FaceSwapService` 接口预留但 MVP 为 no-op：脸不像的帧先多候选重抽，仍不过则 dropped + 触发张数补偿（补 credits / 免费重试）。
4. **移动优先**：所有界面竖屏优先，特别照顾移动端体验；i18n 默认 `en`，`zh` 后置但同步维护。

---

## 1. SPEC 假设 vs 现有代码：差异与处理

| SPEC 假设 | 实际代码 | 处理 |
|---|---|---|
| Next.js 14 | **Next.js 16.2.2 + React 19** | 用最新 App Router 模式 |
| UI 用 shadcn/ui | **完全自定义组件库**（`components/`+`features/`，少量 Radix） | 基于现有组件扩展，不引入 shadcn |
| Creem 用 `@creem_io/better-auth` 插件 | **自定义 `lib/payments/creem.ts`**（配置驱动） | 加积分包只改 `constants/billing.ts`，webhook 零改动 |
| Better Auth 原生邮件验证 | **半自定义**（已有 `/api/auth/verify-email`、`resend-verification` + `lib/email.ts`） | 复用现成路由，不依赖 Better Auth 钩子 |
| （未提及） | **`generationHistory` 表已存在**（image/video demo） | 新增 `generation_job`/`generation_frame` 与之并存，互不影响 |

**可复用清单（已逐一验证）**：Better Auth 认证、`getActiveSessionUser`/`SessionGuard`/`EmailVerifiedGuard`/`requireAdmin`、积分系统 `getUserCredits`/`deductCredits`/`refundCredits`/`canUserAfford` + 失败补偿 `createCreditCompensation`、配置驱动的 Creem 支付、R2 存储 `uploadImageFromUrl`/`uploadToR2`/`deleteFromR2`/`isR2Configured`、火山引擎封装（认证/baseURL/fetch，`generateImage` 已支持 `inputImages[]`）、Resend 邮件、next-intl、Tailwind 主题 + 自定义组件。

---

## 2. 分层架构

```
前端  /create 创作流 · /board(My Stories) · 落地页 · 结果页
  │   复用 components/ + features/ + Framer Motion；移动优先
  ▼
/api/scene/*  路由层    ← Better Auth 鉴权 + credits 校验（复用）
  ▼
SceneOrchestrator  编排状态机（lib/scene/orchestrator.ts，独立可测）
  │   plan → 组图 → 三重质检 → 选择性多候选补救 → 封面 → 逐帧落库
  ▼
8 个可替换 Service 接口（lib/scene/services/*）
  ├ UploadGate · IntentRewriter · PromptModeration · ScenePlanner
  ├ ImageGenService · QualityCheck · IdentityCheck · SetCoherenceCheck
  └ FaceSwapService(预留 no-op)
  ▼
适配层（复用，不重写）:
  lib/volcano-engine/* · lib/r2-storage · lib/credits(+补偿) · lib/payments/creem · lib/email
  ▼
DB（复用 Drizzle 实例与约定）: 新增 generation_job + generation_frame
```

**新增目录结构**：
```
lib/scene/
  types.ts          所有类型（JobStatus/FrameStatus/ScenePlan/ShotSpec/各 service IO）
  config.ts         阈值/模型/provider 配置（读 env，带默认值）
  prompts.ts        ScenePlanner 系统指令 + 各 coherence_type 模板 + IntentRewriter 规则表
  repository.ts     job/frame 的 DB 读写（封装 Drizzle）
  orchestrator.ts   SceneOrchestrator 状态机
  services/
    upload-gate.ts · intent-rewriter.ts · prompt-moderation.ts · scene-planner.ts
    image-gen.ts · quality-check.ts · identity-check.ts · set-coherence-check.ts
    face-swap.ts · index.ts(工厂：按 provider env 选实现)
lib/volcano-engine/
  config.ts(改：模型 ID 从 env 读) · vision.ts(新：豆包视觉多模态) · image.ts(改：组图参数)
```

---

## 3. 数据模型（遵循现有 schema 约定：`text` 主键 / `varchar` 存 enum / snake_case 列 / `defaultNow` 时间戳）

```ts
// lib/db/schema.ts 新增
generationJob = pgTable("generation_job", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }), // 免费匿名可空
  status: varchar("status", { length: 24 }).notNull().default("draft"),
    // draft|planning|awaiting_choices|generating|completed|partial|failed
  rawPrompt: text("raw_prompt"),
  safePrompt: text("safe_prompt"),
  rewriteApplied: boolean("rewrite_applied").notNull().default(false),
  rewriteReason: varchar("rewrite_reason", { length: 40 }).notNull().default("none"),
  moderationStatus: varchar("moderation_status", { length: 16 }).notNull().default("not_checked"),
  moderationReason: text("moderation_reason"),
  scenePlan: jsonb("scene_plan"),
  selfieUrl: text("selfie_url"),           // 临时，按隐私策略删除
  identityRef: jsonb("identity_ref"),       // 用完清理
  shotCount: integer("shot_count").notNull().default(4),  // 4 free | 9 paid
  aspectRatio: varchar("aspect_ratio", { length: 8 }).notNull().default("4:5"),
  creditsCost: integer("credits_cost").notNull().default(0),
  tier: varchar("tier", { length: 8 }).notNull().default("free"),  // free|paid
  createdAt, updatedAt, completedAt,
});

generationFrame = pgTable("generation_frame", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => generationJob.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  shotSpec: jsonb("shot_spec"),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
    // pending|generating|passed|swapped|dropped|failed
  imageUrl: text("image_url"),
  identityScore: real("identity_score"),
  qualityScore: real("quality_score"),
  failReason: varchar("fail_reason", { length: 16 }),  // identity|realism|null
  candidatesTried: integer("candidates_tried").notNull().default(0),
  isCover: boolean("is_cover").notNull().default(false),
  createdAt, updatedAt,
}, t => ({ jobIdx: index("generation_frame_job_idx").on(t.jobId) }));
```

`scene_plan`（jsonb）结构、约束见 SPEC 第 2 节：`scenario_cluster` ∈ 10 个场景簇；`risk_level` ∈ `low|medium|high|blocked`（blocked 直接拒绝）；`coherence_type` ∈ `time_arc|object_anchor|status_facets|event_arc|aesthetic_series|fantasy_variations`（仅 time_arc 允许时间推进为核心结构）；免费 4 张 / 付费 9 张各有默认 `set_structure`，9 张须 9 个不重复叙事/视觉角色。

---

## 4. Service 接口层（8 个，全部 interface + provider）

```ts
// 关键签名（详见 SPEC 5.1–5.8）
interface UploadGate { check(file): Promise<{ ok: boolean; issues: string[]; hint?: string }> }

interface IntentRewriter {  // local 规则表，保留视觉/情绪目标，泛化证明/欺骗表达
  rewrite(input: { rawPrompt: string; userId?: string }): Promise<{
    safePrompt: string; rewriteApplied: boolean;
    rewriteReason: 'none'|'proof_to_editorial'|'ownership_to_lifestyle'|'specific_identity_to_style'|'deception_to_imagined'|'brand_or_org_to_generic'|'blocked';
    userNotice?: string }> }

interface PromptModerationService {  // provider: local | creem
  screenPrompt(input: { safePrompt: string; rawPrompt?: string; userId?: string }): Promise<{
    decision: 'allow'|'flag'|'deny';
    reason?: 'impersonation'|'adult'|'violence'|'deception_or_proof'|'minor_safety'|'unknown';
    userMessage: string }> }  // flag/deny/超时 都 fail closed

interface ScenePlanner {  // 豆包文本
  classifyScene(safePrompt): Promise<{ scenario_cluster; risk_level; coherence_type; moderation_action }>;
  generateClarifyingQuestions(safePrompt, classification): Promise<Question[]>;  // 2–3 选择题，不含张数
  buildScenePlan(safePrompt, answers, shotCount): Promise<ScenePlan>; }

interface ImageGenService {  // Seedream 组图，扩展 lib/volcano-engine/image.ts
  generate(shots, referenceImages, opts): Promise<{ index; imageUrl }[]>; }  // sequential_image_generation=auto, 4:5

interface QualityCheck {  // 豆包视觉一次判像+真
  check(selfieUrl, candidateUrl): Promise<{ same_person; deformity; plastic_skin; quality; issues }>; }

interface IdentityCheck {  // provider: vlm(MVP) | volcano_face(正式)
  similar(selfieUrl, candidateUrl): Promise<{ same: boolean; score?: number }>; }

interface SetCoherenceCheck {  // 豆包视觉
  check(selfieUrl, frames, scenePlan): Promise<{ same_person_across_set; outfit_consistent; visual_style_consistent;
    coherence_type_followed; duplicate_compositions; deceptive_or_proof_like; set_quality; weak_frames }>; }

interface FaceSwapService { swap(targetUrl, selfieUrl): Promise<{ imageUrl: string } | null>; }  // MVP no-op→null
```

**固定顺序**：raw → IntentRewriter → safe → PromptModeration → ScenePlanner。审核在扣 credits、创建 job、调出图模型之前。

---

## 5. 编排流水线（SPEC 5.7 落地，SceneOrchestrator 状态机）

```
组图模式并行出整组（便宜）
for each frame: QualityCheck(像①+真②)
  ①②都过 → passed
  否则 → 仅对坏帧多候选重抽 2–3 张，各自 QualityCheck，取双过最优 → passed
    仍无双过 → 按 fail_reason 分流：
      identity → FaceSwap(MVP no-op→null) → 仍不行则 dropped
      realism  → dropped
SetCoherenceCheck(passed/swapped, scenePlan)
  ③不过 → 只重跑 weak_frames；整组结构错 → 重建 scenePlan 整组重跑
张数不足 → 补偿 credits / 允许免费重试
is_cover = passed 中 identity 高且构图最佳者
job.status = completed | partial
```

**铁律**：用户只看到 passed/swapped；dropped 永不展示。免费目标 4 张、付费 9 张；宁可补偿也不放不合格帧。机器细节（相似度/阈值/重抽/换脸/质检）全程对用户隐形，只用情绪化语言。

---

## 6. API 路由契约（App Router，写操作走 Better Auth）

```
POST /api/scene/clarify  { rawPrompt }            → { safePrompt, rewriteApplied, rewriteReason, userNotice?, classification, questions[] }
                                                     （先 IntentRewriter 再 PromptModeration；拒绝则返回拒绝文案 + 安全改写 chips）
POST /api/scene/plan     { safePrompt, answers }   → { scenePlan }（帧数按 tier）
POST /api/scene/jobs     { selfieUrl, scenePlan }  → { jobId }（校验 credits；扣减在审核通过后）
GET  /api/scene/jobs/:id                           → { job, frames[] }（前端轮询逐张渲染）
--- 后续阶段 ---
POST /api/scene/frames/:id/regenerate              → 重跑单帧
POST /api/scene/jobs/:id/export { format }         → 导出
```

---

## 7. 前端（移动优先）

- 页面：落地页 `/(marketing)`、`/create` 创作流（公开，首组免费不强制注册）、`/board`（My Stories，protected）、`/pricing`、合规页、邮箱验证页。
- 创作流：上传自拍（即时质量提示）→ 一句话 → 动态选择题（点选不打字）→ 分镜预览 → 开始生成 → **占位卡 + 逐张揭晓**（Framer Motion 显影）+ 封面优先 → 结果页一键导出 4:5。
- **延迟体验（SPEC 6）**：一点开始立刻显示 N 张占位卡（用 `narrative_role`/`summary`）；每张过质检即淡入填卡；补救只让该卡转圈不阻塞其余；封面优先让 ~20s 内先拿到一张"哇"。
- **移动端**：竖屏优先；构图安全区（主体勿置顶 80px / 最底）；触控友好的选择题 chips；占位卡九宫格在窄屏自适应。
- 若 `rewriteApplied=true`：轻提示不打断（`Created as an imagined editorial scene.`）。
- 定位口径：全站创意/想象/趣味，严禁 fake/deceive/pretend 等欺骗措辞。

---

## 8. 环境变量

**现有（已在 .env.example）**：`DATABASE_URL`、`BETTER_AUTH_*`、`AUTH_GOOGLE_*`、`VOLCANO_ENGINE_API_KEY`、`VOLCANO_ENGINE_API_URL`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`STORAGE_*`(R2)、`CREEM_*`、`NEXT_PUBLIC_APP_URL`。

**新增（均带默认值，可不填用默认）**：
```env
IMAGE_MODEL=doubao-seedream-4-0-250828      # Seedream 出图，可切 5.0
VLM_MODEL=                                    # 豆包视觉模型 ID（火山控制台确认，质检/IdentityCheck 用）
SCENE_TEXT_MODEL=doubao-1-5-thinking-pro-250415  # ScenePlanner 编排（可换更快变体）
PROMPT_MODERATION_PROVIDER=local             # local | creem
IDENTITY_CHECK_PROVIDER=vlm                  # vlm(MVP) | volcano_face(正式)
QUALITY_MIN=3                                # 单帧真实感及格线
SET_QUALITY_MIN=3                            # 组质量及格线
IDENTITY_THRESHOLD=0.6                       # 正式版火山人脸相似度阈值
SELFIE_RETENTION_HOURS=24                    # 自拍最长保留
SCENE_DEV_FALLBACK=true                      # 无 key 时出图返回占位图（dev）
```

**第一阶段真实联调最小必需（届时找用户要）**：`DATABASE_URL`（建表+读写）、`VOLCANO_ENGINE_API_KEY`、`VLM_MODEL`（豆包视觉模型 ID）。R2/自拍存储第一阶段可用 data URL 兜底（现有 `/api/upload/image` 在无 R2 时降级），阶段 3 导出再强制 R2。

---

## 9. 阶段路线图

| 阶段 | 交付 |
|---|---|
| **1 端到端竖切**（当前） | 2 表 + 模型可配置 + 8 service 最小实现 + 编排（免费 4 张路径）+ 4 个 API + 最小创作流前端 + 单测 |
| 2 后端流水线打磨 | 付费 9 张全链路、多候选/封面优先、SetCoherence 调优、阈值可配、张数补偿 |
| 3 创作流前端 + 延迟体验 | 占位卡/逐张揭晓/封面动效精修、`/board`、导出 4:5 |
| 4 落地页 + 品牌（frontend-design） | SceneSelf hero、before→after、场景案例、`/pricing` 改造、移动端精修 |
| 5 计费接入 | story-set packs（$4.99/$9.99/$19.99）+ $12.99 订阅 + 去水印分档 |
| 6 邮件 + 合规 | 验证策略、营销 opt-in、法律页真实内容、禁止词扫描、人脸隐私删除、9.5 自查清单 |

---

## 10. 第一阶段：端到端竖切 — 实现任务分解（有序）

1. **配置可配置化**：`lib/volcano-engine/config.ts` 模型 ID 从 env 读（`IMAGE_MODEL`/`VLM_MODEL`/`SCENE_TEXT_MODEL`）；新建 `lib/scene/config.ts`（阈值/provider）。更新 `.env.example`。
2. **类型**：`lib/scene/types.ts`（JobStatus/FrameStatus/ScenePlan/ShotSpec/Question/各 service IO）。
3. **数据模型**：`lib/db/schema.ts` 加 `generationJob`+`generationFrame`；`pnpm db:generate` 出迁移 SQL（不连库）。
4. **repository**：`lib/scene/repository.ts`（createJob/updateJob/getJob/insertFrame/updateFrame/listFrames）。
5. **service 最小实现**（TDD 优先纯逻辑）：
   - `intent-rewriter.ts`（local 规则表，**先写单测**）
   - `prompt-moderation.ts`（local provider：关键词 + 简单规则，fail closed）
   - `prompts.ts`（ScenePlanner 系统指令 + coherence 模板）
   - `scene-planner.ts`（豆包文本；`scene_plan` 输出**校验 + 单测**）
   - `image-gen.ts`（扩展火山 image：组图参数 + `SCENE_DEV_FALLBACK` 占位图）
   - `vision.ts`（豆包视觉多模态调用封装）+ `quality-check.ts` + `identity-check.ts`（vlm provider，共用一次调用）
   - `set-coherence-check.ts`（基础）
   - `face-swap.ts`（no-op→null）
   - `services/index.ts`（按 env 选 provider 的工厂）
6. **编排器**：`lib/scene/orchestrator.ts`（免费 4 张路径状态机：plan→组图→质检→坏帧多候选→封面→落库；**状态流转写单测**）。
7. **API**：`clarify`/`plan`/`jobs`/`jobs/[id]` 四个路由（Better Auth 鉴权 + credits 校验；扣减在审核后）。
8. **前端最小创作流**：`app/[locale]/create/`（上传→一句话→选择题→占位卡→逐张揭晓→结果页），用现有组件先朴素但**移动优先**；i18n en+zh。
9. **联调**：拿到 `DATABASE_URL`+`VOLCANO_ENGINE_API_KEY`+`VLM_MODEL` 后 `pnpm db:push` 建表，本地端到端跑通真实 4 张。

**验收**：本地从上传一路走到看见 4 张（无 key 时占位图）；编排状态机、IntentRewriter 规则、scene_plan 校验有单测覆盖；`pnpm lint` + `pnpm test` 通过。

---

## 11. 测试策略

- **单测（Vitest，不依赖外部服务）**：IntentRewriter 规则（证明/欺骗→creative 各 case）、PromptModeration local 拦截、scene_plan 结构校验（cluster/risk/coherence 合法性、张数=tier、9 张不重复角色）、SceneOrchestrator 状态流转（全过/坏帧补救/张数不足→partial）。
- **接口为主 + dev fallback**：ImageGen/QualityCheck/IdentityCheck 在无 key 时走 fallback，保证前端流程可演示。
- **真实联调**：key 到位后端到端跑真实出图/质检。

---

## 12. 合规要点（贯穿，阶段 6 集中落实，DoD 门槛）

- 全站创意/想象口径；构建前禁止词扫描（无 fake/deceive/catfish/fool/pretend/proof/假装/骗）。
- 人脸隐私：自拍仅用于本次生成与一致性校验，不存模板训练；job 完成清理 `selfie_url`+`identity_ref`；用户可一键删除；覆盖 GDPR/BIPA。
- 内容审核硬底线：禁他人/名人脸、NSFW、未成年人不当内容、真实经历/拥有/身份证明；高风险转 editorial 或拒绝。
- 法律页填真实内容（ToS/Privacy 含人脸条款/Refund/Cookie/联系方式）。
- 营销邮件含退订、仅发 opt-in；事务邮件与营销分离。
- 9.5 支付前置自查清单逐项打勾。

---

## 13. 实现进展与联调适配（截至 2026-06-03）

### 已完成
- **第一阶段端到端竖切**：地基（schema/config/types/repository）、安全层（IntentRewriter+Moderation）、ScenePlanner、出图质检 service、SceneOrchestrator、4 个 `/api/scene/*` 路由 + 匿名上传、移动优先创作流前端。42 个 Vitest 单测覆盖纯逻辑。**已用真实环境端到端跑通**（一句话→分镜→Seedream 出图→豆包视觉质检→R2→落库→轮询）。
- **落地页**（阶段 4）：暗房电影感美学，hero / before→after / 场景案例 / 三步 / CTA，桌面+移动均验证。首页脱离旧模板 NavBar/Footer（`marketing-chrome.tsx` 条件渲染）。
- **出图策略**（阶段 2，实测后定）：Seedream 组图模式（`sequential_image_generation`）是**串行**生成——实测 4 张 **131s**，9 张会超 Vercel 300s，违背延迟目标。故 MVP **默认逐帧并行**（4 张 ~30s），组一致性靠参考图 + continuity prompt（第一阶段质检全过即达标）。`generateSceneSet` 保留为可选"高一致性慢模式"（`runGeneration` 的 `generateSet` 不传即逐帧）。
- **质检提速**：豆包视觉 `thinking:{type:"disabled"}` 关闭推理（reasoning_tokens→0），质检大幅加速（SPEC 1.1"用快的变体"）。所有 Seedream 出图 fetch 加 180s 超时，防 fetch 挂起把 job 永久卡在 generating。
- **禁止词扫描**（合规 9.1）：`scripts/check-forbidden-words.mjs`，集成 `build` 前置。

### 火山 API 适配（用户最终提供的模型与 SPEC 假设的差异 —— 重要）
| 用途 | 模型 ID | API 形态 | 关键点 |
|---|---|---|---|
| 出图 | `doubao-seedream-5-0-260128` | `POST /images/generations` | `size:"2K"`（非像素），4:5 由 prompt 引导得 1792×2240；组图用 `sequential_image_generation:"auto"` + `sequential_image_generation_options.max_images`，非流式一次返回整组 |
| 文本编排 | `doubao-1-5-pro-32k-250115` | `POST /chat/completions` | 标准 OpenAI 格式；`createChatCompletion` 加了可选 `model` 参数 |
| 视觉质检 | `doubao-seed-2-0-pro-260215` | **`POST /responses`** | reasoning 模型；请求体 `input:[{role,content:[{type:"input_image",image_url},{type:"input_text",text}]}]`；响应取 `output[type=="message"].content[output_text]`（跳过 reasoning）；`vision.ts` 已按此重写 |

- 存储：用户用 `R2_*` 前缀，代码读 `STORAGE_*`，`.env.local` 已映射。
- `sceneConfig.imageSize` 默认 `"2K"`（`SCENE_IMAGE_SIZE` 可覆盖）。

### 已知可优化（不阻塞）
- `buildScenePlan` 的 LLM 调用 ~24s 偏慢（生成完整 JSON）。可让 LLM 只出精简结构、image_prompt 本地合成。
- Seedream 偶尔生成地标文字（prompt 已写 no text）；可在 SetCoherenceCheck 加一条或接受为场景元素。

### 待用户提供（上线时）
- **Creem 支付**：key + webhook secret + story-set/订阅 price ID → 计费、解锁完整 9 张
- **Resend 邮件**：key + 已验证发件域名 → 注册邮箱验证
- **法律实体信息**：运营主体、联系邮箱、司法管辖地 → ToS/Privacy/Refund 真实内容
```
