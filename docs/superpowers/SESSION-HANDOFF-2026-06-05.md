# SceneSelf 会话交接总结(2026-06-05)

> 给新窗口/接手者:读这份就能接上。核心设计见 `docs/superpowers/specs/2026-06-04-storyline-scene-generation-design.md`。

## 一句话状态

**后端"故事线生成引擎" + 前端"2 题问答 UI(Plan B)"均已完成并验证**(后端:OpenRouter Gemini + 8 类故事线 + 类型感知造型/道具/视角;前端:调性 8 emoji 卡 + AI 高亮 + 侧重动态,两题分屏)。全量 **261 测试 + lint 全绿**。下一步:**Q1/Q2 真机实测反馈** + 上线就绪项(见待办)。

---

## Plan B(前端 2 题问答 UI)完成纪要 — 2026-06-05 最新

把 `/create` 从旧的"问氛围/风格"问答重写为 **2 题**(对齐后端故事线引擎)。writing-plans → subagent-driven 执行(每 task: implementer + spec review + code quality review);plan 存 `docs/superpowers/plans/2026-06-05-storyline-frontend-questions.md`。

- **Task 1** — `/api/scene/clarify` 改用 `analyzeInput`,返回 `storyline_type/tone_suggestions/focus_options`(替代旧 `questions/classification`);`scene-api.ts` 的 `ClarifyResult` 契约同步更新。
- **Task 2** — i18n(zh+en)新增 `scene.tones.*`(8 调性 label/hint)、`scene.focus.<type>.*`(8 类侧重)、`clarify.tone/focus` 文案、`steps.tone/focus`;旧 `clarify.title/subtitle/continue/planning` 已删。⚠️ 注意路径:调性走 `t(\`tones.<id>.label\`)`=`scene.tones.*`,侧重走 `t(\`focus.<type>.<id>\`)`=`scene.focus.*`,页面文案才是 `clarify.tone.*`/`clarify.focus.{title,subtitle}`(三者不同路径,别混)。
- **Task 3** — `app/[locale]/create/page.tsx`:Step 流程改 `upload→describe→tone→focus→generating→result`(FLOW 4 段进度条);新增 `ToneStep`(8 emoji 卡 2 列 + AI 预选高亮角标 + Other)、`FocusStep`(后端 focus_options 动态卡 + Other)、`OtherInput`(共享组件)。无障碍:选择卡 + Other 加 `aria-pressed`、emoji `aria-hidden`、Other 按钮幂等守卫(防重复点清空已输入文本)。`answers` 简化为 `{tone,focus}` 直接 POST 给已就绪的 `buildScenePlan`。
- **验证** — 261 测试 + lint 全绿;curl `/api/scene/clarify` 确认前后端契约(journey→tone_suggestions+4 focus_options);浏览器确认 upload 步渲染 + **4 段进度条** + 无 console error。**Q1/Q2 登录态视觉待真机实测**(见待办 A)。

---

## 后端引擎会话完成了什么(更早)

### 1. 出图/文本/视觉全面迁移到 OpenRouter
- 出图:火山 Seedream → **OpenRouter `google/gemini-3.1-flash-image-preview`**(Nano Banana 2)
- 文本/视觉(故事线/质检/翻译):→ **OpenRouter `google/gemini-3.1-flash-lite-preview`**
- 新增模块 `lib/openrouter/`(`config.ts`/`image.ts`/`chat.ts`/`types.ts`/`index.ts`)
- 火山只剩 Demo 的 chat/video 在用(`lib/volcano-engine/` 保留);scene 主流程已无火山
- env:`.env.local` 有 `OPENROUTER_API_KEY`(⚠️ **daily limit 10**,省着测)、`OPENROUTER_*_MODEL`、`OPENROUTER_IMAGE_SIZE`、`SCENE_REFERENCE_CHAINING`

### 2. 故事线重构(Plan A)— 把"6 图同场景"改成"6 个不同场景的故事"
- 完整 brainstorming → spec → plan → subagent 执行
- **两段式 LLM**:① 据 [输入+类型+调性+侧重] 生成故事线(6 个不同 `StoryBeat`,含造型);② 每帧展开成 image_prompt(场景用 beat 自己的 setting+activity,不再用整体主题)
- **8 类故事线类型库**(`constants/scene-storylines.ts`):journey/ownership_flex/fantasy_role/milestone_event/profession/lifestyle/seasonal/transformation。每类有组织逻辑 + 专属侧重选项 + 调性预选
- 删除旧的硬编码叙事弧(VEHICLE_ARC 等)
- 文件:`lib/scene/services/story-line.ts`(新)、`scene-plan.ts`、`scene-planner.ts`、`prompts.ts`、`types.ts`、`constants/scene-storylines.ts`

### 3. 🐛 关键 bug 修复(影响面很大)
`lib/scene/config.ts` 的 `textModel`/`visionModel` 之前**优先读火山时代的 `SCENE_TEXT_MODEL`/`VLM_MODEL`(豆包 ID)**,传给 OpenRouter 报"not a valid model ID"→ **故事线生成 + 质检一直在静默 fallback**(故事性差、质检等于没开)。已改成直接用 `openRouterConfig`。这是 OpenRouter 迁移时漏的洞,修了之后引擎才真正生效。

### 4. 类型感知造型/道具/视角修复(Plan A2)
实测发现"古代将军场景里人物穿现代红毛衣牛仔裤、背现代包、自拍"。修复:
- **造型由 LLM 按类型生成**(古代→盔甲战袍、医生→白大褂、婚礼→婚纱),取代硬编码现代装。`generateStoryline` 现返回 `{ attire, beats }`
- **每类标 `era`**(modern/historical/fantasy/future)+ `allowSelfie`/`allowModernProps`。historical/fantasy → 强制禁自拍 + 禁现代道具(手机/包/运动鞋)
- **selfie 改真前置视角**(画面看不到拿手机的手、无伸向镜头的手臂);**friend_candid 不拿手机**
- **质检收紧**:多手/三只手必判 deformity 剔除
- 文件:同上 + `lib/scene/services/quality-check.ts`

---

## 实测验证(后端 `/api/scene/plan` 已验证)

- **"豪华游轮看鲸鱼"**(journey) → 码头/甲板/船头看鲸鱼/餐厅/船尾/黄昏休息,6 个不同场景 ✓
- **"穿越古代当将军"**(fantasy_role) → 造型=铁鳞甲+战袍+披风+佩剑(非现代装)、全 friend_candid(无自拍)、每帧含 no-modern 约束、6 个史诗场景(战帐/营地/隘口/战后/塔楼/神龛)✓

---

## ⏭️ 待办(下一步,按优先级)

### A. Plan B ✅ 已完成(2026-06-05) — 剩 Q1/Q2 真机实测
前端 2 题问答 UI 已实现并验证(见上方"Plan B 完成纪要")。`/create` 现为调性(8 emoji 卡 + AI 高亮)+ 侧重(动态)两题分屏。**剩余**:
- **Q1/Q2 真机实测(最优先)**:需登录态上传自拍走完整流程,确认调性卡/AI 高亮角标/侧重卡/4 段进度条视觉,并确认后端真收到 `answers.tone/focus`(看 `/api/scene/plan` 请求体)。`pnpm dev` 后开 `/zh/create`(中文)、`/create`(英文)。
- **小清理(已 spawn_task)**:`BackButton` 加 aria-label(需 i18n key);`GeneratingView` 的 `renderShots` dead `summary` 字段删除。
- **(可选)Other 自由调性后端支持**:Q1 选 Other 输入自定义调性时,后端 `resolveToneId` 找不到匹配会 fallback 到 AI 预选(不严格)。如需精确,给 `generateStoryline` 传 `customTonePrompt`(单独立项)。

### B. 用户实测真出图的反馈
用户在实测真出图(上传自拍走 /create)。可能有新的出图质量反馈(人物一致性、质检效果、某类造型),按反馈迭代 prompt。

### C. 上线就绪(之前评估过,见对话)
- **内容审核**:现在是 local 正则,收费+人脸 AI 上线前要升级(Creem 审核骨架已在 `prompt-moderation.ts`)
- **人脸一致性**:现在是通用 vision LLM 粗判,付费上线建议接精确人脸比对
- **隐私 cron**:`/api/cron/cleanup-selfies` 要配 Vercel Cron(隐私政策承诺 24h 删自拍)
- **支付**:Creem 凭证(API key/webhook secret/3个 price id)未配;或考虑兑换码方案(对话讨论过:Gumroad/Payhip 对中国个人友好)
- **BETTER_AUTH_SECRET** 还是开发占位符,上线要换
- **face-swap** 是 no-op(`face-swap.ts`),不像本人的帧直接丢

---

## 关键文件地图

```
docs/superpowers/
  specs/2026-06-04-storyline-scene-generation-design.md   ← 故事线机制完整设计(含 2.3 类型感知造型)
  plans/2026-06-04-storyline-engine-backend.md            ← Plan A(后端引擎,已执行完)
  plans/2026-06-05-typeaware-attire.md                    ← Plan A2(造型修复,已执行完)

lib/scene/
  types.ts            ← StoryBeat/StorylineType/SceneTone/SceneAttire/Era/StorylineConstraints
  config.ts           ← sceneConfig(model 现直接用 openRouterConfig)、hasTextProviderKey 等
  prompts.ts          ← STORYLINE_SYSTEM/storylineInstruction(故事线生成指令)
  scene-plan.ts       ← buildFramePromptFromBeat(每帧 prompt)、buildContinuityFromAttire、detectAnchorObject、activity styling(旧 fallback 保留)
  services/
    story-line.ts     ← generateStoryline → {attire,beats}、fallbackStoryline
    scene-planner.ts  ← buildScenePlan(两段式入口)、analyzeInput、storylineDef、classifyScene
    quality-check.ts  ← 质检(已收紧 deformity 多手)
    set-coherence-check.ts / identity-check.ts / face-swap.ts(no-op)
constants/scene-storylines.ts  ← 8 类 STORYLINE_TYPES(含 era/allowSelfie/allowModernProps/attireHint) + 8 个 SCENE_TONES
lib/openrouter/       ← OpenRouter 封装(image/chat/config)
app/[locale]/create/page.tsx   ← 前端问答页(已重写为 2 题:ToneStep/FocusStep/OtherInput)
app/[locale]/create/scene-api.ts ← ClarifyResult 契约(storyline_type/tone_suggestions/focus_options)
app/api/scene/plan/route.ts    ← 规划入口(调 buildScenePlan)
```

---

## ⚠️ 重要提醒(踩过的坑)

1. **dev server hot-reload 不可靠**:改了 `lib/scene/` 等 server 代码后,经常不热加载。验证前用 `preview_stop` + `preview_start` 重启(Turbopack)。改 `.env` 必须重启。
2. **Turbopack 偶发编译卡死**:`/api/scene/upload` 首次编译曾 hang 住整个 dev server(所有请求 0 bytes 超时)。重启 + 预热路由解决。生产 build 无此问题。
3. **scene model 绝不能读火山 env**(SCENE_TEXT_MODEL/VLM_MODEL/IMAGE_MODEL 是豆包 ID)。已在 config.ts 注释警告。
4. **非 git 仓库**:`git status` 报 not a repository。所有"提交"都改成跑测试+lint。如要 git 化需 `git init`(用户的决定)。
5. **OpenRouter key daily limit 10**:实测真出图很费额度(每组 6 图+故事线+质检),省着测;key 已在对话明文出现过,建议 rotate。
6. **测试用 mock**:scene 测试都 mock 了 config/openrouter,所以 model 配置 bug 测试测不出来,要靠实测 `/api/scene/plan`(看耗时 >2s = 真调 LLM,<1s = fallback)。

---

## 验证命令速查
```bash
pnpm test          # 全量(应 261 通过)
pnpm lint          # 应无报错
# 实测后端故事线(不出图、不扣积分):
curl -sS -X POST http://localhost:3000/api/scene/plan -H "Content-Type: application/json" \
  -d '{"safePrompt":"穿越古代当将军","answers":{},"tier":"free"}'
# 看返回 scenePlan.continuity.outfit(应是古装) + shots[].summary(6 个不同场景)
```
