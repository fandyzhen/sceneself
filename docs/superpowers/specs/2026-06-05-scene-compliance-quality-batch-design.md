# Scene 合规与质量批次设计（2026-06-05）

> 来源：用户连续实测（5张/3张/110s/厨师服装/特朗普漏审）暴露的一批问题，合并为一个批次，为接入 Creem 支付通过审核（合规）+ 提升体验。做完用户统一测试。

## 概述

6 项改动，分三组主题，彼此相对独立：

| # | 改动 | 主题 | 风险 |
|---|---|---|---|
| 1 | identity 质检放宽 | 速度/成本 | ⚠️ 高（影响"像本人"卖点） |
| 2 | 移除白跑的组一致性检查 | 速度 | 零 |
| 3 | LLM 故事线分类 | 内容准确 | 低 |
| 4 | 职业服装文案补全 | 内容准确 | 零 |
| 5 | LLM 内容审核 + 针对性替代 | 合规（Creem） | 中 |
| 6 | 本人照片勾选 | 合规（Creem） | 零 |

**前置已完成**：maxCandidates 已从 2 回退到 1（缓解了 110s）。本批次的 #1 是进一步的根治。

---

## 1. identity 质检放宽（根治"假失败"重试）⚠️ 需用户拍板

### 背景（实测日志实锤）
迪拜实测日志显示大量帧 `tried=3 fail=identity`（首轮跑满候选都被判"不像本人"），然后 dropped 救援放宽后立刻 `passed q=2-4`（其实是好图）。即：**vision LLM 的 `same_person` 判定误判率高**，把像本人的图反复判 false，逼每帧重试，纯烧时间+额度。

根因在 `lib/scene/orchestrator.ts:80` 的 `passes(q, qualityMin)`——首轮要求 `same_person=true` 一票否决（`quality-check.ts:63` `framePasses` 同逻辑）。而 dropped 救援（orchestrator.ts:242）已放宽到 `quality >= salvageMin && !deformity`（不要 same_person），证明这些图可接受。

### 方案
让**首轮**判定也采用"质量足够高时容忍 same_person 误判"的逻辑，减少假失败重试：

- 新增 config：`identityOverrideQuality`（默认 4，env `SCENE_IDENTITY_OVERRIDE_QUALITY`）+ `identityStrict`（默认 false，env `SCENE_IDENTITY_STRICT`）
- 改 `passes` 判定为：
  ```
  通过 = !deformity && !plastic_skin && quality >= qualityMin
         && ( same_person || (!identityStrict && quality >= identityOverrideQuality) )
  ```
  含义：质量达标 + 无畸形/塑料皮的前提下，same_person=true 直接过；same_person=false 但质量很高（≥4）也过（多半是误判）；质量平庸又被判不像本人才重试/drop。
- `identityStrict=true` 时恢复原严格行为（一票否决），作为兜底开关。

### ⚠️ 权衡（这是该你拍板的点）
- **收益**：大幅减少假失败重试 → 提速（anchor 不再跑满候选）+ 省额度（少出图少质检）+ 减少 partial。
- **代价**：如果 vision LLM 偶尔判对（真不像本人）且质量高，会放进一张"不太像本人"的高质量图。但实践中出图用的是用户自拍作 reference，多数图本就像本人，same_person=false 以误判为主。
- **保守程度可调**：`identityOverrideQuality` 越高越保守（设 5 则几乎只救满分误判）；`identityStrict=true` 完全回退。
- **决策选项**：A 用默认 4（平衡，推荐）；B 设 5（更保守，只救最高质量误判）；C 暂不改质检，只靠 maxCandidates=1 缓解。

### 测试
- 单测 `passes` 逻辑：构造 `{same_person:false, quality:4, deformity:false}` → 默认应 pass；`identityStrict=true` → 应 fail；`{same_person:false, quality:3}` → 应 fail（质量不够高，不容忍误判）。

**文件**：`lib/scene/config.ts`（新增两个 config）、`lib/scene/orchestrator.ts`（改 `passes`）、`tests/lib/scene/identity-relax.test.ts`（新）

---

## 2. 移除白跑的组一致性检查（零代价省 5-20s）

`orchestrator.ts:214-219` 的 `checkSetCoherence` 跑一次 vision LLM 阻塞 job 完成，但结果 `coherence` 全项目无人读取/落库/拦截（已 grep 确认）。移除调用，`coherence` 返回 undefined。保留 `set-coherence-check.ts` 模块 + `deps.checkSetCoherence` 注入（未来要用可重启用），只是不调用。

**文件**：`lib/scene/orchestrator.ts`（移除 214-219 调用块，`coherence` 设 undefined）

---

## 3. LLM 故事线分类（修"变身大厨"归错奇幻类）

### 背景
"变身大厨"被 `getStorylineType` 正则判成 `fantasy_role`（命中"变身"关键词，而"大厨"不在 profession 正则），导致生成奇幻中世纪宫廷大厨（丝绸金绣袍+石窟厨房），而非现代专业厨师。正则分类太脆弱。

### 方案
`analyzeInput`（scene-planner.ts:203）改用 LLM 判 `storyline_type`：
- 新增 `classifyStorylineLLM(safePrompt)`：复用 `llmJson` helper（scene-planner.ts:32），给 LLM 看 8 个类型定义（id + organizingLogic + 例子）+ 用户输入，返回 `{ storyline_type }`，明确引导"识别真实意图：'变身大厨'是想当现代厨师→profession，不是奇幻穿越"。
- fallback：LLM 失败/无 key/返回非法 id → `getStorylineType(safePrompt)`（正则保底）。
- `tone_suggestions`/`focus_options` 仍按选中 typeDef 取。
- **不影响出图速度**：分类在 clarify/plan 阶段，不在出图链路。

### 测试
mock LLM 返回 profession → analyzeInput("变身大厨") 应得 profession；mock LLM 失败 → 应 fallback 到正则结果。

**文件**：`lib/scene/services/scene-planner.ts`、`lib/scene/prompts.ts`（新增分类 prompt）、`tests/lib/scene/analyze-input.test.ts`（增强）

---

## 4. 职业服装文案补全（西方标准制服）

`constants/scene-storylines.ts` profession 的 `attireHint` 现在只写 "chef's whites"，缺围裙/厨师帽。补全为各职业完整标准制服：
```
the profession's real uniform/attire — for a chef: white double-breasted chef jacket, checkered or dark chef pants, toque/chef hat, and apron tied at the waist; doctor: white coat over scrubs/business casual with a stethoscope; pilot: airline uniform with epaulettes and captain's hat; executive: tailored suit. ALWAYS include the full set of standard uniform items for the profession, never substitute casual clothing.
```
同时修 `lib/scene/services/story-line.ts:111` 的 `fallbackStoryline` modern 分支——当前硬编码 `"modern casual outfit"`，改为读 `typeDef.attireHint`（无 LLM key 时也能给出职业制服）。

**文件**：`constants/scene-storylines.ts`、`lib/scene/services/story-line.ts`

---

## 5. LLM 内容审核 + 针对性替代（Creem 合规核心）

### 背景
当前审核（`prompt-moderation.ts` localScreen + `intent-rewriter.ts`）是英文正则：中文全盲（"裸体/特朗普/习近平"全放行）、名人名单只 13 人且要全名（"President Trump"漏网，实测放行）。靠 Gemini 兜底 = 烧额度 + 体验差 + 上线风险。

### 方案
**(a) 审核改 LLM**：`prompt-moderation.ts` 加 `llmScreen` provider：
- 复用文本模型，prompt 列审核类别（adult / minor_safety / violence / impersonation 真实公众人物 / deception_or_proof），中英文语义判断，返回 `{ decision: allow|deny, reason, matched }`。
- `moderationProvider` 增加 `"llm"` 选项；默认从 `local` 切到 `llm`（env `SCENE_MODERATION_PROVIDER` 可调）。
- fail closed：LLM 失败/超时 → deny（unknown）。保留 localScreen 作为 LLM 不可用时的快速预筛兜底。

**(b) 针对性安全替代**：clarify route 现在 rejected 时返回硬编码 `SAFE_CHIPS`。改为：
- 新增 `generateSafeAlternatives(rawPrompt, reason)`：LLM 按用户**原始意图**生成 2-3 个"符合意图但不违规"的安全场景（如"和特朗普共进晚餐"→"米其林餐厅政商精英晚宴/与神秘贵宾烛光晚餐/顶层会所商务晚宴"）。
- LLM 失败 → 回退现有硬编码 chips。

**(c) 友好提示文案**（不指责、共情意图、给出路）：
- i18n 文案改为非指责语气（"换个方式可能更好 ✨"而非"内容违规"），正文用"暂时没法直接生成"等中性词，重点放替代上。
- 前端 rejected UI 已有 rejectedTitle/rejectedBody/safeRewriteChips 结构，文案微调 + chips 来源改 LLM。

### 测试
- `llmScreen`：mock LLM 返回 deny/adult → screenPrompt 应 block；mock 中文"裸体晚宴" → 应 block（验证不再中文全盲）；mock allow → 放行。
- `generateSafeAlternatives`：mock LLM 返回 3 条 → 应取 3 条；失败 → 回退硬编码。

**文件**：`lib/scene/services/prompt-moderation.ts`、`lib/scene/prompts.ts`（审核+替代 prompt）、`app/api/scene/clarify/route.ts`、`messages/{zh,en}.json`、`lib/scene/config.ts`（provider 默认）、测试

---

## 6. 人脸检测 + 本人照片勾选（拦无效上传 + 合规）

### 背景
`checkUpload`（upload-gate.ts）只校验 mime/大小/尺寸，**无人脸检测**——传狗/风景/任意图都会继续生成怪图、烧额度。纯 checkbox 是无技术背书的空声明（传狗还勾"确认本人"很尴尬）。

### 方案
**(a) 人脸检测**：upload 后用 vision LLM 校验"清晰单人人脸自拍"：
- 新增 `checkFace(selfieUrl)`（复用 OpenRouter vision，prompt 判 `{ has_clear_face: bool, single_person: bool, issues: string[] }`）
- upload route 在存图后调 `checkFace`；不通过（无脸/多人/糊）→ 返回 `{ ok:false, reason }`，前端**友好提示重传**（"没检测到清晰的正脸，换一张自拍试试～"），不进入下一步、不创建 job
- 失败/无 vision key → 放行（dev 不阻塞流程演示；正式可经 env 改 fail closed）
- 成本：upload 阶段一次 vision LLM（~1-2s），一次性、不在出图链路，反而省了给无效图出图的额度

**(b) 本人照片勾选**：人脸检测通过后，upload 步显示 checkbox "我确认这是本人照片，且我有权使用它"：
- **必勾**才能继续（"继续" disabled until 勾选）；**不默认勾**
- 有人脸检测背书，不尴尬；还挡 deepfake 他人（真人但非本人）

### 测试
`checkFace`：mock vision 返回 `{has_clear_face:false}` → ok=false；返回 `{has_clear_face:true, single_person:true}` → ok=true；无 key → 放行。

**文件**：`lib/scene/services/face-check.ts`（新）、`lib/scene/services/index.ts`（导出）、`lib/scene/prompts.ts`（face-check prompt）、`app/api/scene/upload/route.ts`（调 checkFace）、`app/[locale]/create/page.tsx`（upload 步：失败提示 + checkbox）、`messages/{zh,en}.json`、`tests/lib/scene/face-check.test.ts`（新）

---

## 关键决策（用户已确认 2026-06-05）

1. **质检放宽程度**（#1）：✅ 默认平衡 `identityOverrideQuality=4`，env `SCENE_IDENTITY_OVERRIDE_QUALITY` / `SCENE_IDENTITY_STRICT` 可调。
2. **审核 provider 默认**（#5）：✅ 默认切 `llm`（中英文语义判断），fail closed 兜底；保留 local 作快速预筛/兜底。
3. **#6 上传校验**：✅ 人脸检测（vision LLM 校验清晰单人人脸，传狗/风景/合影友好提示重传）+ 本人照片勾选（必勾、不默认勾）。

## 实施顺序建议（plan 分组）
- 第一组（合规，Creem 上线关键）：#5 + #6
- 第二组（速度/成本）：#1 + #2
- 第三组（内容准确）：#3 + #4

## 非目标 / 风险
- 不接精确人脸比对（volcano_face）——质检放宽是 vision LLM 内的调参，人脸比对是更大的付费上线项，本批次不做。
- 不做图片内容审核（出图后审核）——本批次只做输入审核。
- LLM 审核增加 clarify 延迟（多一次 LLM），但不在出图链路，可接受。
- 质检放宽是质量 vs 速度的真实权衡，需用户实测确认 `identityOverrideQuality` 取值。
