# DEPLOY.md — SceneSelf 上线 checklist

照这份从上到下做。打勾 = 完成。任何一步卡住,**先停下**问明白再继续。

> 这份是浓缩版,详细架构看 [CLAUDE.md](CLAUDE.md);底线约束看 [AGENTS.md](AGENTS.md)。

---

## 🔴 上线前必做(外部控制台,不是 commit)

### 1. R2 控制台 — 加 selfie 自动删除

防止人脸数据永久留存(隐私 + 法律风险)。

- [ ] 进 Cloudflare R2 控制台 → 选你的 bucket → **Object Lifecycle Rules**
- [ ] 点 `+ Add`
  - **Rule Name**: `delete-selfies-after-1-day`
  - **Prefix**: `selfies/` ← **绝对不能留空!留空会删 `images/` 用户成片**
  - **Action**: `Delete object after 1 day`
  - **Status**: Enabled
- [ ] 不要动 `Default Multipart Abort Rule`(那是 R2 内置规则,清失败的上传分片,跟普通对象无关)

### 2. Vercel 控制台 — 项目导入 + 配置

#### 2.1 导入项目
- [ ] Vercel Dashboard → **Import Git Repository** → 选 `fandyzhen/sceneself`
- [ ] Framework Preset: **Next.js**(应该自动识别)
- [ ] **先不要点 Deploy** — 把环境变量配完再 deploy

#### 2.2 必填环境变量(Settings → Environment Variables)

| Key | 值 | 备注 |
|-----|-----|------|
| `DATABASE_URL` | Neon postgres URL | 跟本地一致 |
| `BETTER_AUTH_SECRET` | 32+ 字符随机串 | `openssl rand -base64 32` 生成 |
| `BETTER_AUTH_URL` | `https://你的-vercel-域名.vercel.app` | ⚠️ **不能是 localhost** |
| `NEXT_PUBLIC_APP_URL` | 同上 | ⚠️ 同上 |
| `OPENROUTER_API_KEY` | 你的 OpenRouter key | 跟本地一致 |
| `OPENROUTER_API_URL` | `https://openrouter.ai/api/v1` | |
| `OPENROUTER_IMAGE_MODEL` | `google/gemini-3.1-flash-image-preview` | |
| `OPENROUTER_TEXT_MODEL` | `google/gemini-3.1-flash-lite-preview` | |
| `OPENROUTER_VISION_MODEL` | `google/gemini-3.1-flash-lite-preview` | |
| `OPENROUTER_IMAGE_SIZE` | `1024px portrait 4:5` | |
| `RESEND_API_KEY` | Resend key | 跟本地一致 |
| `RESEND_FROM_EMAIL` | `SceneSelf <hello@sceneself.com>` | 确保 sceneself.com 在 Resend 后台已 Verified |
| `CREEM_API_KEY` | Creem live key | 跟本地一致 |
| `CREEM_WEBHOOK_SECRET` | `whsec_...` | Creem 后台拿 |
| `CREEM_API_BASE` | `https://api.creem.io` | |
| `CREEM_WEEKLY_PRICE_ID` | Creem weekly 产品 priceId(**新价 $9.90**) | 见 §3 |
| `CREEM_MONTHLY_PRICE_ID` | Creem monthly priceId(**新价 $29**) | 见 §3 |
| `CREEM_YEARLY_PRICE_ID` | Creem yearly priceId(**新价 $299**) | 见 §3 |
| `STORAGE_ACCESS_KEY_ID` | R2 access key | |
| `STORAGE_SECRET_ACCESS_KEY` | R2 secret | |
| `STORAGE_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | |
| `STORAGE_BUCKET_NAME` | 你的 R2 bucket 名 | |
| `STORAGE_PUBLIC_URL` | `https://<custom-or-r2.dev>/` | R2 公网 URL |
| `CRON_SECRET` | 32+ 字符随机串 | 给 Vercel cron 鉴权用 |

#### 2.3 **必须改的(不能照搬 .env.local 默认值)**

| Key | 改成 | 原因 |
|---|---|---|
| `SCENE_DEV_FALLBACK` | `false` | 生产必须真出图,不能返占位图 |
| `PROMPT_MODERATION_PROVIDER` | `llm` | 默认 `llm`,显式写出来,**别用 `local`(Creem 审核会拒)、别用 `creem`(自家 API 没发布)** |

#### 2.4 Function 配置(Settings → Functions)

- [ ] 确认 **Fluid Compute = Enabled**(vercel.json `fluid: true` 已声明,Vercel 应该自动开)
- [ ] **Region**: 选离用户近的(国内访问选 `hnd1` Tokyo,全球选 `iad1` Washington)

#### 2.5 防意外大账单 ⚠️ 强烈推荐

- [ ] Settings → **Billing → Spending Limits**
- [ ] 设 **$50/月硬上限**(超量自动停 function 执行,防 bug 死循环或恶意流量爆账单)

#### 2.6 部署

- [ ] 点 **Deploy** 触发首次部署
- [ ] 等到 Status = Ready,拿到 `https://xxx.vercel.app`

#### 2.7 Cron Jobs(Settings → Cron Jobs)

- [ ] 应该自动识别 `vercel.json` 里的 2 条规则
- [ ] 确认两条 status = Enabled:
  - `/api/cron/cleanup-selfies` 每小时 `0 * * * *`
  - `/api/cron/subscription-grants` 每小时 `0 * * * *`
- [ ] 点 **Run Now** 各跑一次,看响应:
  - cleanup-selfies 应返回 `{ retentionHours: 24, purged: N, r2Deleted: N }`
  - subscription-grants 应返回 `{ processed: N, schedulesTouched: N }`

### 3. Creem 控制台 — 配产品 + webhook

- [ ] **Products** → 建 3 个新产品:
  - SceneSelf Weekly — **$9.90 / week**
  - SceneSelf Monthly — **$29 / month**
  - SceneSelf Yearly — **$299 / year**
- [ ] 每个产品拿 `priceId`,回填到 Vercel 环境变量(§2.2 表的 CREEM_*_PRICE_ID)
- [ ] **Webhooks** → 新建:
  - **URL**: `https://你的-vercel-域名/api/payments/creem/webhook`
  - **Events**: 选 `checkout.completed`、`subscription.paid`、`subscription.active`
  - **Secret**: 复制到 Vercel `CREEM_WEBHOOK_SECRET`(§2.2)

### 4. 域名 + DNS(可选,但推荐)

- [ ] Vercel → Settings → Domains → Add `sceneself.com`
- [ ] 改你 DNS 提供商:
  - 根域 `sceneself.com` → A 记录指 Vercel IP(Vercel 控制台给)
  - `www.sceneself.com` → CNAME → `cname.vercel-dns.com`
- [ ] Vercel 自动签 SSL(几分钟内 HTTPS 就绿)
- [ ] **改环境变量**:`BETTER_AUTH_URL` 和 `NEXT_PUBLIC_APP_URL` 改成 `https://sceneself.com`
- [ ] 触发新部署让 env 生效
- [ ] **改 Creem webhook URL** 为 `https://sceneself.com/api/payments/creem/webhook`

### 5. Resend 域名(发件人验证)

- [ ] Resend Dashboard → Domains → `sceneself.com` 应该是 **Verified**
- [ ] 三项 DNS 记录都是 ✅:**DKIM / SPF / DMARC**
- [ ] 任一红色都要先在 DNS 加对应记录,否则用户邮箱可能进垃圾箱

---

## ✅ 部署后冒烟测试(必跑)

按顺序测,任何一步失败 → 看 Vercel Functions Logs 找原因。

### 测试 1: 注册 + 验证邮件
- [ ] 浏览器无痕开 `https://你的域名/signup`
- [ ] 用一个真实能收信的邮箱注册(比如你的 Gmail)
- [ ] **几秒内**应收到验证邮件(发件人 SceneSelf <hello@sceneself.com>)
  - 没收到 → 看 Vercel Logs `/api/auth/[...all]` + Resend Dashboard Activity
  - 进垃圾箱 → DNS DKIM/SPF/DMARC 没配好

### 测试 2: 注册赠送 300 积分
- [ ] 验证后登录,看 dashboard 显示**余额 300**
- [ ] 不是 300 → DB `credit_ledger` 看有没有 `reason=registration_bonus` 记录

### 测试 3: 跑一组 Scene
- [ ] `/create` 页 → 上传一张自拍 + 输一句"旅游九宫格"之类
- [ ] 应正常走过 4 步 → 生成阶段
- [ ] 1-3 分钟内出 6 张图(看进度条)
- [ ] 看 Vercel Logs `/api/scene/jobs`:
  - 应该看到 `[SceneOrchestrator] runJob done: delivered=N/6`
  - 如果 N < 6,正常,会有 dropped 帧
- [ ] result 页应显示 6 张图(含 dropped 救回的) + banner 显示退款(如果有 dropped)
- [ ] 看账户余额: 300 - 300 + 退款 = 应剩 `100 × dropped` 积分
  - 例:dropped=2 → 退 200 → 余 200 积分 ✅

### 测试 4: Creem 真付款
- [ ] 用测试卡或真卡(Creem 后台开 test mode 或 simulate)买 weekly $9.90
- [ ] 付完后**几秒内**:
  - 看 Vercel Logs `/api/payments/creem/webhook` 200 OK
  - DB `payment` 表新增一行
  - DB `subscription` 表新增/更新一行
  - `user.credits` += 1500
  - 邮箱收到购买确认信
- [ ] 任一缺失 → 看 webhook 日志找原因(签名错?env 不全?)

### 测试 5: Admin dashboard
- [ ] 创管理员:本地跑 `pnpm admin:setup` 或 `ADMIN_EMAIL=你的邮箱 pnpm admin:setup`
- [ ] 登录后访问 `/admin`
- [ ] 应看到 7 个 stat cards 含 "本月 dropped 率"
- [ ] 底部应有 "本月消耗最多的用户" 表格(你自己刚刚跑了 1 组应出现)

### 测试 6: cron 真正跑了
- [ ] 等下一个整点(或在 Vercel Cron Jobs 页手动 Run Now)
- [ ] cleanup-selfies:看 R2 bucket,你刚才上传的 selfie 24h 后应被删
- [ ] (注:首小时跑也行,只是不会真删除任何东西因为时间没到)

---

## ⚠️ 上线后头一周必看

| 指标 | 在哪看 | 异常信号 |
|---|---|---|
| Vercel Functions Errors | Dashboard → Functions → Errors | 任何 5xx 都要看 log |
| 单次 runJob 耗时 | Functions Logs `[SceneOrchestrator] runJob done` | 持续 > 5 分钟说明 OpenRouter 慢或 prompt 复杂 |
| dropped 率 | `/admin` dashboard | > 15% 高亮警告,要看 prompt 工程或调质检阈值 |
| Vercel 账单 | Settings → Billing | 接近 $50 spending limit 就告警 |
| Resend 日发件量 | Resend Dashboard | 接近免费层 100/天上限要升 Pro |
| R2 存储增长 | Cloudflare R2 Dashboard | 异常涨说明 lifecycle 没生效 |
| Creem 退款率 | Creem Dashboard | 高退款率 = 用户对成片不满 |

---

## 🆘 卡住了怎么办

| 问题 | 第一步看哪 |
|---|---|
| 部署失败 | Vercel Deployments → Failed → Build Logs |
| 网站 500 | Vercel Functions → 看具体路由 logs |
| 用户付款没积分到账 | webhook logs + DB `payment` 表 |
| Scene 卡 generating 不动 | runJob logs + 余额对不对 |
| 验证邮件没收到 | Resend Activity + DNS 验证状态 |
| Creem webhook 签名错 | env `CREEM_WEBHOOK_SECRET` 跟 Creem 后台是否一致 |

进一步排查:[content/docs/troubleshooting.mdx](content/docs/troubleshooting.mdx)。

---

## 🚀 上线祝你顺利

完成所有 🔴 + 测完 ✅,可以向第一批用户开放了。

**最后一句忠告**:第一周**每天看一次 Vercel Functions Logs + admin dashboard**,有任何 5xx / dropped 率异常 / 账单异常立刻处理。早期 bug 处理代价小,等用户多了再修很被动。
