# SceneSelf 上线就绪批次 spec

**日期**: 2026-06-06  
**状态**: ready-to-execute（仅待 2 个 ❓ 项最后确认）  
**目标**: 完成 Creem 审核 + 营销获客 + 生成体验三个维度的最后一公里。  
**总工程量**: ~11-14h（按推荐顺序 4 批次分次执行）

---

## 批次概览

| 批次 | 包含 | 工程量 | 价值 | 顺序建议 |
|---|---|---|---|---|
| **A** | 首页提速 + 清旧模板痕迹 | 30min | 视觉立即提升 + 上线必备 | 立刻 |
| **B** | 生成页 4 项体验改造 | 2-3h | 用户实际感受最强 | 紧接 A |
| **C** | 用户切走不打断生成 | 1-2h | 移动端体验关键 | 紧接 B |
| **D** | 兑换码系统（含合作伙伴 API） | 7-8h | 营销获客核心工具 | 独立排期 |

---

## 批次 A · 轻量必做（30min）

### A1. Hero marquee 提速 2x

- **改什么**: 首页 3 行电影胶片墙 `80s/110s/65s` → `40s/55s/32s`，肉眼明显流动
- **位置**: `app/[locale]/(marketing)/cinema-strip-hero.tsx` 行内 `<MarqueeRow duration={...}>`
- **验收**: 桌面静止 1 秒能看到图片明显位移；hover/click 仍正常暂停 + 高亮组

### A2. 全站清除旧模板痕迹

- **改什么**: grep 全项目旧模板品牌词，逐一替换为 SceneSelf；删模板教堂 SVG Logo（已被 Fraunces 文字 Logo 替代）；版权年份改 2026；删模板 GitHub repo 链接
- **位置**: 
  - `messages/{en,zh}.json` 多处旧模板品牌字样
  - `components/Logo.tsx`（教堂 SVG，可直接删整文件，已无使用）
  - `components/footer.tsx`（旧模板 Footer，废弃但保留无害；可删）
  - `package.json` 包名保留（仅内部 npm id，不暴露）
- **验收**: 全项目品牌 grep 仅 `package.json` 1 处命中

---

## 批次 B · 生成页体验（2-3h）

### B1. 生成开始顶部「耐心等待」提示

- **改什么**: GeneratingView 顶部加一行海外用户友好文案，告诉用户"约 90-170 秒，可切换其他 app 稍后回来"
- **文案**:
  > "Crafting your scene takes about **90-170 seconds**. Feel free to switch tabs or grab a coffee — we'll keep working in the background. Come back anytime to see the result."
  > 
  > 中文: "构思你的场景大约需要 **90-170 秒**。可以切换其他应用或冲杯咖啡 — 我们会在后台继续生成，随时回来查看结果。"
- **位置**: `app/[locale]/create/page.tsx` 的 `GeneratingView`（约 line 600-700 区域）
- **i18n key**: 新增 `scene.generating.patience.{title,sub}`
- **验收**: 中英文都流畅；移动端不溢出

### B2. 进度条「逐条揭晓」新样式

- **改什么**: 替换现有进度条为「垂直列表 + 逐条点亮 ✓」样式，参考 lifeflexia 提示风
- **5 条步骤文案**（按 SceneSelf 实际流程，匹配 180s 总时长）:
  1. `Analyzing your selfie` (~0-25s) - 对应人脸检测 + 质量审核
  2. `Building your storyline` (~25-50s) - 对应 generateStoryline LLM
  3. `Setting the scenes` (~50-90s) - 对应每帧 image_prompt 构建
  4. `Generating your photos` (~90-160s) - 对应出图（占大头）
  5. `Polishing the final set` (~160-180s) - 对应质检 + dropped 救援
- **进度条总长按 180s 线性铺满**；实际生成完成时立即跳到 100% → 体验上"提前揭晓"
- **样式**:
  - 暗背景卡片 + amber 圆圈 ✓ icon + 步骤文字
  - 已完成: amber 实心圆 ✓ + 文字 amber-100
  - 进行中: amber 圆圈空心 + 旋转 spinner + 文字 stone-100
  - 未开始: stone 灰圈 + 文字 stone-500
  - **配色用 SceneSelf amber，不是参考图的紫色**
- **位置**: `app/[locale]/create/page.tsx` GeneratingView 内的 `renderShots` 或新建 `ProgressLadder` 子组件
- **验收**: 移动端单列；30s 一阶按 wallclock 触发；生成提前完成时立即跳完整步骤

### B3. 生成完毕「丢失帧补偿」提示

- **改什么**: 结果页顶部加 banner（仅当 dropped > 0 时显示）
- **文案**:
  > "Used **X** credits · **Y** shot(s) didn't make it. We refunded you **2× = Z** credits as compensation. The **Double** boost is on us."
  
  其中 `Z = 50 × Y × 2`，"**Double**" 用 Fraunces italic + amber-300 加粗大 1 号
- **位置**: 结果页（`app/[locale]/create/page.tsx` ResultView 区）
- **数据源**:
  - `X` 实际扣减积分: 已存 db `generation_job.creditsCost`
  - `Y` dropped 帧数: 查 `generation_frame` where `status='dropped'`
  - `Z` 退还积分: 已存 db `credit_ledger` where `reason='scene_refund'`，直接 read
- **验收**: 6/6 完美交付时 banner 不出现；5/6 时显示 "1 shot... 100 credits"；4/6 时 "2 shots... 200 credits"
- **❓ 待确认**: 补偿系数究竟是 `50 × Y × 2` 还是 `50 × Y`？我从"双倍"推断 = 100/张（即翻倍补偿）。如只想退回原价 50/张，把 2× 去掉

### B4. 一键下载全部

- **改什么**: 结果页加 amber 大按钮 `Download all (6)`
- **行为**:
  - **桌面**: 用 JSZip 打包 6 张为 `sceneself-{slugify(prompt)}-{timestamp}.zip` 下载
  - **移动端**（含 iOS Safari + Android Chrome）: 优先用 `navigator.share({ files })` 调系统分享面板（用户选「存到相册」）；不支持则降级为逐张 `<a download>`
- **检测**: `'share' in navigator && navigator.canShare?.({ files: [...] })` 判定移动端能力
- **位置**: 结果页新组件 `DownloadAllButton.tsx`
- **依赖**: 新装 `jszip` (~30kb)
- **验收**: iPhone Safari + Android Chrome 都能保存到相册；桌面 Chrome/Firefox/Safari 都能下载 zip

---

## 批次 C · 后台持续生成（1-2h）

### C1. 用户切走/切回不打断生成

- **现状（已实现）**: 生成是异步 db job，**后端在 Vercel 持续跑**，不依赖前端在线
- **缺**: 前端 page visibility change 时轮询会暂停（浏览器节流后台 tab）；用户回来后页面不知道生成已完成
- **改什么**: 
  - 监听 `document.visibilitychange`，从 hidden→visible 时**立刻 force 一次 fetch**
  - 用户切走时**不取消请求**（用 AbortController 但不在 visibilitychange 时 abort）
  - 移动端 PWA-like 体验: 标签页标题 / favicon 显示进度（如 `(45%) SceneSelf`）让 task switcher 一眼能看到状态
- **位置**: `app/[locale]/create/page.tsx` GeneratingView 的 `useEffect(轮询)`
- **验收**: iPhone Safari 测试: 开始生成 → 切到主屏 60s → 切回 → 立刻显示完成的帧数
- **❓ 待确认**: 是否要加 PWA push notification（生成完毕手机推送提示）？这要装 service worker + 推送权限，+2h 工程量。**默认不加**，等用户量起来再做

---

## 批次 D · 兑换码系统（7-8h）

> 用户已选: 方案 A（仅 personal 一码一用）+ API 自助（合作伙伴可调 API 生成）+ 暂不限新用户

### D1. DB schema（30min）

**新表 1: `redemption_code`**
```sql
code            varchar(12) UNIQUE INDEX  -- 12 位字母数字,排除 0/O/1/I/L
batch_id        varchar INDEX
credits         integer
channel         text NULLABLE             -- 渠道备注（"Lisa 12 月推广"）
used_by         text NULLABLE             -- userId FK
used_at         timestamp NULLABLE
created_by      text                      -- 'admin' 或 partnerId
expires_at      timestamp NULLABLE        -- 现在不实现过期,字段先留
created_at      timestamp DEFAULT now()
```

**新表 2: `partner_api_key`**
```sql
id              uuid PRIMARY KEY
name            text                      -- 合作伙伴名（"小红书运营组"）
key_hash        text                      -- sha256(key),不存明文
key_prefix      varchar(8)                -- 前 8 位用于识别（"sk_abc12…"）
daily_limit     integer DEFAULT 1000      -- 每日生成码上限
codes_today     integer DEFAULT 0         -- 当日已生成数
today_resets_at date                      -- 用于每日重置 codes_today
total_generated integer DEFAULT 0
created_at      timestamp
last_used_at    timestamp NULLABLE
deactivated     boolean DEFAULT false
```

### D2. API 端点（2h）

| 路径 | 鉴权 | 输入 | 返回 |
|---|---|---|---|
| `POST /api/redeem` | session cookie（必须登录） | `{ code }` | `{ creditsAdded, newBalance }` 或 error |
| `POST /api/admin/codes` | admin role | `{ count, credits, channel? }` | `{ batchId, codes[], csvUrl }` |
| `POST /api/partner/codes` | `x-api-key` header | `{ count, credits, channel? }` | `{ batchId, codes[], csvUrl }` |

**通用规则**:
- 单次最多 500 码（防滥用）
- partner API 额外 daily_limit 检查（达上限 429 + 邮件告警 admin）
- 兑换并发安全: `UPDATE redemption_code SET used_by=$user, used_at=now() WHERE code=$code AND used_by IS NULL RETURNING credits` —— atomic CAS，保证一码一用

### D3. 管理后台 `/admin/codes`（2h）

- **页面 1 · 批次列表**: 
  - 表格列: batchId / 创建方（"admin" or partner name）/ 渠道 / 总数 / 已用 / 剩余 / 创建时间
  - 顶部按钮: 「+ New Batch」弹层（count + credits + channel → 生成 → 弹层显示 csvUrl 可下载）
- **页面 2 · 单批次详情**: 
  - 该 batch 全部码列表，每行: 12 位码（已用的划线灰显）+ 状态 + 已用的点开看 `{ userEmail, usedAt }`
  - 顶部按钮: 「Download CSV」「View Stats」

### D4. 管理后台 `/admin/api-keys`（1.5h）

- 表格列: 合作伙伴名 / key prefix（"sk_abc1...")/ daily limit / 累计生成 / 上次使用 / 操作（撤销）
- 「+ New API Key」按钮:
  - 弹层输入: name + daily limit
  - 生成后**一次性显示完整 key**（关闭后只能撤销重发，明文不再可见）
- 撤销: deactivated=true，之后该 key 调 API 全部 401

### D5. 用户端 `/credits` 兑换 card（45min）

- 在现有积分页顶部加 card:
  ```
  ┌────────────────────────────────┐
  │  Have a code?                  │
  │  ┌────────────────┐  [Redeem] │
  │  │ A3F2-H8K9-LM7N │            │
  │  └────────────────┘            │
  └────────────────────────────────┘
  ```
- 显示展示用 4-4-4 分组（用户体验好输入），DB 存连续无分隔符
- 大小写不敏感（前端 toUpper 后提交）
- 错误提示友好: `Invalid code` / `Already used` / `Code expired`（expired 文案现在不会触发但保留）
- 兑换成功: toast `+1500 credits!` + 实时更新积分余额 + 加入历史记录

### D6. 兑换历史（可选 polish）

- `/credits` 页面下方展示该用户近 10 条兑换记录（code 前 4-末 4 / credits / usedAt）
- 不实现也 OK，但能让用户知道兑换成功留痕

### D7. 合作伙伴 API 文档（30min）

- 新建 `docs/partner-api.md`（不需要 Fumadocs 集成，单独 Markdown 即可）
- 含: 请求示例 (curl)、错误码、限额说明、联系方式
- 同时在 `/admin/api-keys` 页面顶部加链接「View API docs」

---

## 默认假设（你不反对就采纳）

| 项 | 默认 |
|---|---|
| 进度条 / 兑换 toast 配色 | SceneSelf amber（不用紫色） |
| B3 补偿系数 | `50 × Y × 2`（每张丢失 100 积分补偿）— ❓ 待确认 |
| 下载文件名 | `sceneself-{prompt前30字}-{i}.jpg`（zip 内文件） |
| 兑换码字符集 | `ABCDEFGHJKMNPQRSTUVWXYZ23456789`（排除 0/O/1/I/L） |
| 兑换码展示格式 | 用户输入框: 4-4-4 分组 / DB: 连续 12 位 |
| 大小写 | 兑换时 toUpper 后比对，DB 存全大写 |
| 过期时间 | **现在不实现**，db schema 留字段 |
| 历史兑换记录 | `/credits` 下方展示近 10 条（D6） |
| 移动端下载 | Web Share API 优先 / 不支持降级逐张下载 |
| C1 PWA push | **不加**（待用户量起来后做）— ❓ 待确认 |
| Admin 给 partner 默认日限额 | 1000 码/天 |
| API 单次最多生成 | 500 码 |

---

## ❓ 待你最后确认（2 项）

### Q1. B3 丢失帧补偿系数

补偿"双倍"具体是哪种？

- **A. `50 × Y × 2`**（每张丢失退 100 积分，即翻倍补偿）—— 我推断你说"双倍"是这个意思
- **B. `50 × Y`**（每张丢失退 50 积分，即等价退还，"双倍"是文案修辞）

### Q2. C1 是否加 PWA push notification

生成完毕推送到手机？

- **A. 现在加**（+2h，要装 service worker + 推请求权限）
- **B. 暂不加**（默认推荐），等 DAU > 1000 再加

---

## 推荐执行 timeline

```
今晚（30min）:     A1 + A2       → 立刻能上线（清模板痕迹是审核必备）
明天上午（3h）:    B1+B2+B3+B4   → 生成页一次性改完
明天下午（1-2h）:  C1            → 移动端持续生成不打断
后天全天（7-8h）:  D1→D2→D3→D4→D5→D6→D7 → 兑换码系统
```

**单独 commit 策略**: 每批次跑测试通过后 git commit 一次（项目非 git 仓库需手动管理 snapshot；建议批次 D 完成后跑一次完整 build 当作 release 标记）。

---

## 关联待办（已暂存在 TaskList）

| 暂存项 | 与本 spec 关系 |
|---|---|
| #15 A 档：实测验证今天的 prompt 改动落地 | 独立任务，建议本 spec 完工后做 |
| #16 B 档：上线门槛非阻塞项（邮箱验证 / 法律页 / cron） | 与本 spec D 兑换码可并行 |
| #17 C 档：上线阻塞项（Creem 三档 priceId） | 兑换码 + Creem 都属于「积分获取入口」，可一起做 |

---

## 风险/取舍

1. **D 兑换码系统是最大单项**（~7-8h）。如时间紧张可拆分: D1+D2+D5 优先（用户能兑换 + 你能手动 admin 生成码就够首日营销），D3+D4 推后（API 自助可第二周再做）。
2. **B2 进度条**视觉效果决定首次体验，建议优先级 ≥ B3/B4，因为生成期是用户最焦虑的窗口。
3. **C1 visibility 监听**移动端 Safari 历史有 bug（iOS 17 修复），仍建议加 `setTimeout fallback` 兜底（哪怕 visibility 失效，每 10s 也刷一次）。
