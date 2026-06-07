// SceneSelf 运行配置：模型 / 阈值 / provider，全部可经环境变量覆盖。
// 见 SPEC 1.2、1.4、5.7、11 与设计文档第 8 节。

import { openRouterConfig } from '../openrouter/config';

function numEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

export type ModerationProvider = 'local' | 'creem' | 'llm';
export type IdentityProvider = 'vlm';

export const sceneConfig = {
  // ---- 模型 ----
  // 三类模型全部走 OpenRouter（出图 = Nano Banana 2，文本/视觉 = Gemini 3.1 Flash Lite）。
  // 覆盖请用 OPENROUTER_IMAGE_MODEL / OPENROUTER_TEXT_MODEL / OPENROUTER_VISION_MODEL（见 openRouterConfig）。
  imageModel: openRouterConfig.imageModel,
  textModel: openRouterConfig.textModel,
  visionModel: openRouterConfig.visionModel,

  // ---- provider 切换 ----
  moderationProvider: (process.env.PROMPT_MODERATION_PROVIDER || 'llm') as ModerationProvider,
  // identity 当前只有 vlm 一种实现（OpenRouter Gemini Lite 粗判 same_person）。
  // 如需更严的人脸比对,在 identity-check.ts 加 provider 分支并扩展类型。
  identityProvider: 'vlm' as IdentityProvider,

  // ---- 质量阈值（上线前用目标市场多族裔样张校准）----
  qualityMin: numEnv('QUALITY_MIN', 3),
  setQualityMin: numEnv('SET_QUALITY_MIN', 3),
  identityThreshold: numEnv('IDENTITY_THRESHOLD', 0.6),
  // salvage 门槛：候选都没过 QUALITY_MIN 但 same_person 且 quality≥此值时仍展示，
  // 避免单帧偶发不过质检导致用户拿不到 6/6（用户体验"承诺 6 给 5"硬伤）。
  // 默认 = QUALITY_MIN - 1（不低于 2），仅在 best 候选完全不像本人 / 极差时才真的 drop。
  salvageQualityMin: numEnv('SALVAGE_QUALITY_MIN', Math.max(2, numEnv('QUALITY_MIN', 3) - 1)),

  // ---- 张数与补救 ----
  // v2：每组固定 6 张（free 与 paid 同），每张 50 积分；水印由订阅状态决定。
  freeShotCount: 6,
  paidShotCount: 6,
  // 速度 vs 质量平衡：5.0 + base64 + 3 并发下，单帧 30-50s。
  // 默认 1（首图 + 1 重试 = 最多 2 候选）。曾试过 2 想提高 6 张达成率，但实测日志显示：
  // identity 质检误判率高 → 失败帧反复重试，maxCandidates=2 让每帧多跑一次（anchor 串行第一张飙到 ~110s），
  // 而 6 张达成率并未明显提升（真正保 6 张的是 dropped 帧救援机制，不是多候选）。故回退到 1。
  // 根治在于降低 identity 质检误判（见 plan）；更稳可设 SCENE_MAX_CANDIDATES=2（但更慢、更烧额度）。
  maxCandidatesPerFrame: numEnv('SCENE_MAX_CANDIDATES', 1),

  // identity 质检容错：vision LLM 判 same_person 误判率高(好图被判 false)→ 反复重试烧时间。
  // 质量足够高(>=identityOverrideQuality)时容忍 same_person=false(多半误判),减少假失败。
  // identityStrict=true 恢复 same_person 一票否决。详见 plan/spec。
  identityOverrideQuality: numEnv('SCENE_IDENTITY_OVERRIDE_QUALITY', 4),
  identityStrict: process.env.SCENE_IDENTITY_STRICT === 'true',

  // dropped 帧的救援尝试次数(每帧):走完所有 maxCandidates 后仍 dropped 时,用 passed 帧作 reference 重跑。
  // 成功即停;每次失败也只占 ~30-50s/帧(图模型 + 质检),不并发不影响首图。
  // 实测:1 次救援能救约 50% 的 dropped 帧;2 次能救 ~70%(收益递减),3 次基本无新增。
  rescueAttempts: numEnv('SCENE_RESCUE_ATTEMPTS', 2),

  // reference chaining：先串行出第1帧作为"组内视觉锚"，其余帧带它做参考并发出图。
  // 组一致性（衣服色 / 配饰位置 / anchor 内饰色）显著提升，代价是总耗时多一个单帧（~30-60s）。
  // 默认开（"保证质量"优先）；想回到纯并发最快模式设 SCENE_REFERENCE_CHAINING=false。
  referenceChaining: boolEnv('SCENE_REFERENCE_CHAINING', true),

  // ---- 画幅 ----
  // Seedream 5.0 的 size 用分辨率档（"1K"|"2K"|"4K"）；4:5 由 image_prompt 引导。
  aspectRatio: '4:5',
  imageSize: process.env.SCENE_IMAGE_SIZE || '2K',

  // ---- 隐私 ----
  selfieRetentionHours: numEnv('SELFIE_RETENTION_HOURS', 24),

  // ---- dev fallback：无火山 key 时出图返回占位图，让前端流程可演示 ----
  devFallbackEnabled: boolEnv('SCENE_DEV_FALLBACK', true),
} as const;

// 运行时判断（process.env 在测试中可能被改写，因此用函数而非快照）
// 三类 provider 都走 OpenRouter（同一个 key）
export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}
export const hasImageProviderKey = hasOpenRouterKey;
export const hasTextProviderKey = hasOpenRouterKey;
export const hasVisionProviderKey = hasOpenRouterKey;

// 出图：真实调用还是占位图
export function shouldUseImageFallback(): boolean {
  return !hasImageProviderKey() && sceneConfig.devFallbackEnabled;
}

export function shotCountForTier(tier: 'free' | 'paid'): number {
  return tier === 'paid' ? sceneConfig.paidShotCount : sceneConfig.freeShotCount;
}
