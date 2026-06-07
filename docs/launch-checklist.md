# SceneSelf 上线前自查清单（v2，三档订阅）

> 对照 SPEC 第 9.5 节"支付前置自查"与第 12 节"完工的定义"，同步 `docs/launch-todo.md` 推进结果。
> 状态：✅ 已完成 · 🟡 部分/待联调 · ⏳ 需用户提供凭据或信息 · ⬜ 未开始
> **本轮（按 launch-todo 推进）代码改造已完工**：测试 129/129 绿、tsc 干净（baseline 不变）、lint 通过、禁词扫描通过、`pnpm build` 通过。

---

## 一、产品核心（DoD 1–5、10–11）

| 项 | 状态 | 说明 |
|---|---|---|
| 路径 B 全流程（一句话→分镜→出图→质检→揭晓→入库→导出） | ✅ | 真实端到端跑通 |
| ScenePlanner（cluster/risk/coherence/continuity/set_structure） | ✅ | 豆包文本，dev fallback |
| 选择性多候选 + 三重质检（像/真/组一致） | ✅ | 编排状态机 + 单测 |
| 默认中景/环境人像，避近景大脸 | ✅ | shot_size 偏 medium/wide |
| 延迟体验（占位卡 + 逐张揭晓 + 封面优先） | ✅ | 创作流前端 |
| 机器细节对用户隐形 | ✅ | 只用情绪化文案 |
| IdentityCheck 可替换（豆包视觉 → 火山人脸 API） | ✅ | provider 开关 + 骨架已实现（fail closed），上线切 `IDENTITY_CHECK_PROVIDER=volcano_face` 即可 |
| 出图策略 | ✅ | 逐帧并行 + 完成即揭晓 + 质检关思考提速 |

## 二、计费（DoD 7、SPEC 10）

| 项 | 状态 | 说明 |
|---|---|---|
| 积分校验 / 扣减 / 失败补偿 | ✅ | 复用既有 credits + compensation 实现 |
| **三档订阅（weekly $2.99 / monthly $9.90 / yearly $99）** | ✅ | 已在 `constants/billing.ts` 实装，全部 per_cycle；月付为推荐档 |
| story-pack 一次性积分包下线 | ✅ | `oneTimePacks={}`，checkout 返回 410 Gone，webhook 兜底 ack |
| 去水印分档（免费带水印 / 付费去） | ✅ | 路由按 `hasActiveSubscription` 定水印 |
| Creem 商品 priceId | ⏳ | 需用户在 Creem 后台建 3 个产品并填 env：`CREEM_WEEKLY_PRICE_ID` / `CREEM_MONTHLY_PRICE_ID` / `CREEM_YEARLY_PRICE_ID` |
| Creem API key + webhook secret | ⏳ | `CREEM_API_KEY` + `CREEM_WEBHOOK_SECRET` |
| Creem 商品描述用创意口径 | 🟡 | 接入时用 "AI photo set / imagined scene set"，避免 fake/proof 字眼 |
| 6×50 积分 + 按未交付返还 | ✅ | `lib/scene/pricing.ts` + 62 单测绿 |

## 三、邮件（DoD 8、SPEC 8）

| 项 | 状态 | 说明 |
|---|---|---|
| 注册邮箱验证（24h token，重发支持） | ✅ | 自定义 `/api/auth/resend-verification` + Better Auth `emailVerification` 配置兜底 |
| 营销邮件含独立 opt-in 勾选 | ✅ | `signup-form` 加 `marketingOptIn`（默认不勾），与账号验证分开 |
| 退订持久化 | ✅ | `newsletter_subscription.status='unsubscribed'`，事务邮件不受影响 |
| 品牌替换旧模板 → SceneSelf | ✅ | `lib/email.ts` / newsletter / Logo |
| Resend API key + 验证发件域名 | ⏳ | 需用户在 Resend 后台为 `dzqjiaju.com` 加 SPF + DKIM；未做则邮件进垃圾箱 |

## 四、合规（DoD 12、SPEC 9 —— 上线门槛）

| 项 | 状态 | 说明 |
|---|---|---|
| 全站文案无欺骗导向措辞 | ✅ | `check:forbidden` 扫描通过；build 内置 |
| ToS / Privacy / Refund / Cookie 真实内容 | ✅ | 个人开发者版：独立开发者运营、司法管辖中国大陆、email 联系、不公开真名/住址 |
| Privacy 含人脸数据处理与删除条款 | ✅ | 人脸节 + BIPA/GDPR + 火山数据处理方 |
| 人脸数据自动删除（工程） | ✅ | job 完成 `repo.purgeIdentity` 清 selfie+identity_ref |
| **Selfie 兜底定时清理（24h 承诺）** | ✅ | 新增 `/api/cron/cleanup-selfies`，过期 selfie/identity 清空 |
| 内容审核（他人脸/NSFW/真实人物/未成年人） | ✅ | IntentRewriter blocked + PromptModeration（fail closed） |
| 审核覆盖"真实经历/拥有/身份证明"欺骗用途 | ✅ | IntentRewriter 改写为 editorial 或拒绝 |
| **Creem Moderation 真实调用骨架** | ✅ | `lib/scene/services/prompt-moderation.ts` 5s 超时 + fail closed，上线切 `PROMPT_MODERATION_PROVIDER=creem` |
| 退款政策清晰、无暗扣 | ✅ | Refund 页已加 weekly 档 + 未交付返还规则；可取消、不暗扣 |
| 备用 MoR 预案 | ✅ | Creem 本身即 MoR；备用 Paddle / Lemon Squeezy / Polar |

## 五、部署（DoD 9）

| 项 | 状态 | 说明 |
|---|---|---|
| 纯 Vercel 单函数、边生成边落库 | ✅ | `after()` 后台跑 runJob；出图 fetch 加 180s 超时 |
| 成品走 R2/CDN | ✅ | `uploadImageFromUrl`，无 R2 自动降级 |
| 数据库迁移 | ✅ | `drizzle/`，本地已 `db:push`；生产首次部署需跑 |
| Vercel Pro + Fluid Compute（300s 函数超时） | ⏳ | **必须开**，default 60s 会卡死 |
| 生产环境变量齐全 | ⏳ | 见下方 §六 |
| Cron 配置（cleanup-selfies 每小时） | ⏳ | 兜底兑现 24h selfie 删除承诺 |

---

## 六、需用户提供才能继续的项（上线前）

### 6.1 Creem
- `CREEM_API_KEY`、`CREEM_WEBHOOK_SECRET`
- 在 Creem 后台建 3 个订阅产品：weekly / monthly / yearly
- 填入 `CREEM_WEEKLY_PRICE_ID` / `CREEM_MONTHLY_PRICE_ID` / `CREEM_YEARLY_PRICE_ID`
- Webhook URL: `https://sceneself.com/api/payments/creem/webhook`，监听 `checkout.completed` / `subscription.paid` / `subscription.active`
- 切真审核：`PROMPT_MODERATION_PROVIDER=creem` + `CREEM_MODERATION_URL=...`

### 6.2 Resend
- `RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`RESEND_VERIFIED_DOMAIN=dzqjiaju.com`
- 在 Resend 后台为该域名加 SPF + DKIM DNS 记录
- 可选：`RESEND_AUDIENCE_ID` 用于营销邮件 Audience 同步

### 6.3 火山引擎人脸比对（IdentityCheck 升级，建议上线启用）
- `IDENTITY_CHECK_PROVIDER=volcano_face`
- `VOLCANO_FACE_API_URL=...` + `VOLCANO_FACE_API_KEY=...`（或复用 `VOLCANO_ENGINE_API_KEY`）
- 字段名 (`image_a` / `image_b` / `score`) 上线时需按火山实际 API 文档对齐

### 6.4 部署基础
- Vercel Pro plan + Fluid Compute（函数超时 300s）
- Neon 生产库 + R2 存储
- DNS：sceneself.com 指向 Vercel
- `CRON_SECRET`（或 `CRON_JOBS_USERNAME`/`CRON_JOBS_PASSWORD` Basic auth）
- 配置 Vercel Cron：`/api/cron/cleanup-selfies` 每小时跑一次

### 6.5 可选 / 加分
- 多族裔真人样张（用于校准 `QUALITY_MIN` / `IDENTITY_THRESHOLD`）
- Google OAuth 凭据（`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`）
- 法律实体信息（如要从个人开发者版升级到公司主体）

---

## 七、上线步骤（凭据齐全后）

1. **填环境变量**：照 §6 把所有 ⏳ 标记的 key 填到 Vercel Environment Variables（Production）。
2. **数据库迁移**：`pnpm db:push` 到生产 Neon。
3. **建管理员**：`ADMIN_EMAIL=you@example.com pnpm admin:setup`。
4. **Vercel Cron**：在 vercel.json 或 Vercel UI 加：
   ```json
   { "crons": [{ "path": "/api/cron/cleanup-selfies", "schedule": "0 * * * *" }] }
   ```
5. **真支付联调**：用 monthly 跑一笔（开 Creem 测试模式或 `CREEM_SIMULATE=true`），验证 webhook → 积分 + 订阅 + 无水印。
6. **smoke test**：见下方 §八。

---

## 八、上线日 smoke test

按顺序执行：

1. **注册**：用真实邮箱注册（勾营销 opt-in）→ 收到验证邮件 → 点链接 → 跳 `/dashboard`
2. **生成（无订阅）**：上传自拍 + 写场景 → 预扣 300 积分 → 出图带水印 → 6/6 交付 → 0 返还
3. **支付**：访问 `/pricing` → 点 monthly → 跳 Creem 结账 → 完成支付
4. **webhook 验证**：dashboard 看到 paymentSuccess，积分 +8000，`user.planKey='monthly'`，`subscription.status='active'`
5. **生成（有订阅）**：再生成一组 → 无水印
6. **管理后台**：管理员账户访问 `/admin/users` → 三档显示正确（free/weekly/monthly/yearly）
7. **取消订阅**：从 Creem 客户门户取消 → 下个周期不续费
8. **退订营销邮件**：点邮件底部退订链接 → DB `newsletter_subscription.status=unsubscribed`，后续不再收营销邮件，但事务邮件正常
9. **Selfie 清理**：等 24h 后查 `generation_job.selfie_url` / `identity_ref` 应为 null（或手动调 cron 端点验证）

---

## 九、故障排查

| 症状 | 检查 |
|---|---|
| 支付完成后积分不到账 | Creem webhook 是否触发？签名是否对？`providerPaymentId` 是否重复（idempotency 命中）？|
| 邮件进垃圾箱 | Resend 域名 DNS（SPF + DKIM）是否配齐 |
| 所有生成被审核拦截 | `PROMPT_MODERATION_PROVIDER=creem` 但 `CREEM_MODERATION_URL` 没配 → fail closed |
| 所有生成被剔除返还 | `IDENTITY_CHECK_PROVIDER=volcano_face` 但 endpoint 没配 → fail closed (same=false) |
| Selfie 未在 24h 内删除 | `/api/cron/cleanup-selfies` 没设 cron，或 `CRON_SECRET` 错 |
| 函数 300s 超时 | 必须开 Vercel Fluid Compute；不能用 default 60s |
| 注册不送 300 积分 | 检查 `lib/auth.ts` 的 after hook 是否触发；查 `creditLedger` 是否有 `registration_bonus` 行 |
