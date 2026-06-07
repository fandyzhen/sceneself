# SceneSelf v2 调整设计（登录门槛 / 计费 / 上传 / 问答 / 等待体验 / 提速）

> 日期：2026-06-03 · 基于真实环境实测 + 产品方向调整
> 关联：`2026-06-03-sceneself-design.md`（v1 架构）。本文件只记录 v2 增量与决策依据。

## 0. 实测性能基线（提速方案的事实依据）

用 `.env.local` 真实火山 key 直接压测：

| 环节 | 实测 | 备注 |
|---|---|---|
| 单张 2K 文生图（Seedream 5.0） | 20.4s | 无参考 |
| 单张 2K i2i 出图（带自拍参考，真实流程） | 22.4s | 真实路径 |
| 质检（豆包视觉 `doubao-seed-2-0-pro`，关思考） | 4.8s | 一次判 像/真/瑕疵 |
| **6 帧并发出图** | **6/6 成功，各 22–27s** | 火山**不限流**，墙钟≈最慢单张 |

**结论**：单帧理想 ≈ 出图 22s + 质检 5s ≈ 27s。当前"4 张 170s 只出 3 张"的根因是**编排**，不是模型：
1. **串行候选重试** —— 某帧质检不过，`for` 循环串行重试最多 `maxCandidates(3)+1=4` 次 ≈ 108s，Promise.all 等它，整组被拖死且该帧最终 dropped。
2. **onFrame 在 Promise.all 之后、串行执行 + 串行 R2 上传** —— 所有帧出完才落库，用户轮询期间长时间看不到任何揭晓，违背"逐张揭晓"。
3. **质检无超时** —— 偶发慢会拖死单帧。

## 1. 计费重构：登录门槛 + 6×50 积分 + 三档订阅

**去掉匿名免费**。点"生成"必须登录。
- 注册赠 **300 积分**（已实现，`lib/auth.ts`），恰好 = 免费体验 1 次（6 张 × 50）。
- 每次生成固定 **6 张**（free 与 paid 同），**每张 50 积分**。
- 预扣 300，job 结束按**未交付帧返还**：交付 N 张则退 `(6−N)×50`。
- **水印规则**：有**有效订阅** → 无水印；仅靠注册赠送积分（无订阅）→ 带水印。
- 订阅三档（重构 `constants/billing.ts`，新增 `weekly` cycle）：
  | key | 价格 | 积分/周期 | 备注 |
  |---|---|---|---|
  | `weekly` | $2.99/周 | 1500 | |
  | `monthly` | $9.90/月 | 8000 | **主推** |
  | `yearly` | $99/年 | 100000 | |
  - 旧 `starter_*/pro_*/pack_200` 下线（保留类型兼容，前端只展示新三档）。
  - `creemPriceId` 上线时回填，现用占位，不阻塞开发。
- **测试账号** `35457311@qq.com` / `dongdong`：脚本创建用户 → 设为 `yearly` 有效订阅 → 充 100000 积分（用于无水印测试）。

`shotCountForTier` 改为统一 6；新增 `CREDITS_PER_PHOTO=50`、`SHOTS_PER_SET=6`、`hasActiveSubscription(userId)` 判定水印。

## 2. 上传：HEIC / Live Photo + 移动端相册直达

- `<input accept="image/*,.heic,.heif">`，**不加 `capture`**（让 iOS/Android 点击直接进**相册**选已有自拍，而非强制开摄像头）。iOS/Android 原生 file picker 即含相册入口。
- 服务端 HEIC→JPEG 转码：用纯 JS 的 `heic-convert`（无原生依赖，Vercel serverless 可跑）。iOS 从相册选 HEIC 时 Safari 多数已自动转 JPEG，转码是少数"保留原格式"/安卓 HEIC 的兜底。
- 客户端预览：HEIC 本地 `<img>` 可能不显示，预览降级为上传成功后用返回 URL。

## 3. 问答页：问题/选项层级 + "其他"自定义

- 问题升级为带序号的醒目卡片（更大字号 + 强调色 + `Q1/Q2` 标号），选项弱化为可选 pill，层级分明。
- 每题选项末尾加 **"其他"**：点击展开输入框，写入 `answers[q.id]` 为自定义文本（planner 直接消费）。

## 4. 去掉 review + 缓解等待焦虑

- 流程：`upload → describe → clarify →（直接）generating → result`，**删除 review/讲解页**。clarify 提交后串联 `planScene + createSceneJob`，直接进生成。
- 等待页设计：
  - 占位底用**上传自拍的高斯模糊**（像在冲洗自己的照片），非空白。
  - 阶段话术 + 进度条：`读取你的光影 → 编排 6 个场景 → 搭建场景 → 打磨质感`（专业、不暴露机器细节）。
  - 逐位"虚拟进度"：每个占位走 分析→设计→搭建→打磨，到"打磨"停住，下一位接力；总时长按 **90s** 均分（实测 buffer）。
  - **真实帧一就绪立即显影替换**该位（blur→clear），结束其虚拟进度。真实接管优先于虚拟。

## 5. 提速重构（不降质量）—— Orchestrator

1. **每帧独立流水线 + 完成即揭晓**：`generate → quality →（R2 upload）→ onFrame 落库` 收进单帧 async，6 帧 `Promise.all` 并行。任一帧完成立即落库，前端轮询即见。删除"全部出完再串行上传"。
2. **R2 上传并入每帧、随帧并行**。
3. **质检加 20s 超时 + 超时降级接受**（质检是加分项，不该拖死出图）。
4. **`maxCandidates` 3→1**：最坏单帧 2 次出图 ≈ 54s；配合换脸兜底。
5. **出图超时** 180s→90s：超时判该帧失败补救，不卡死。
6. 预期：首图 ~30s，全套 ~40–65s，远低于 Vercel 300s。

## 6. Resend

已写入 `.env.local`：`RESEND_API_KEY` + `RESEND_FROM_EMAIL="SceneSelf <noreply@dzqjiaju.com>"`。

## 数据模型变更

- `subscription.planKey` 容纳新值 `weekly/monthly/yearly`（已是 varchar，无需迁移）。
- `creditLedger.reason` 新增 `scene_set`（扣）、`scene_refund`（返还）。
- 无破坏性 schema 迁移（计费走既有表）。

## 测试策略（TDD）

- 计费：`creditsForSet`、返还 `(6−delivered)×50`、水印判定 → 单元测试。
- Orchestrator 重构：保持 `runGeneration` 纯逻辑可测；新增"完成即回调顺序""单帧超时降级"用例。
- 上传：HEIC 魔数识别 → 转码分支单测。
- 问答"其他"：answers 合并逻辑单测。

## 风险

- `heic-convert` wasm 较慢（单张数百 ms~1s）：仅 HEIC 触发，可接受。
- 6 并发依赖火山不限流（已实测 6/6）；若上线后限流，编排降级为 3+3 两批（仍 ~60s）。
- 水印依赖订阅状态查询：每 job 一次 `hasActiveSubscription`，加索引即可。
