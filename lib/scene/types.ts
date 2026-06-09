// SceneSelf 领域类型（路径 B）。详见 SPEC 第 0、2、5 节。
// 这些类型不依赖任何运行时模块，可被 schema / service / API / 前端共享。

export type Tier = 'free' | 'paid';

export type JobStatus =
  | 'draft'
  | 'planning'
  | 'awaiting_choices'
  | 'generating'
  | 'completed'
  | 'partial'
  | 'failed';

export type FrameStatus =
  | 'pending'
  | 'generating'
  | 'passed'
  | 'swapped'
  | 'dropped'
  | 'failed';

export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';

// 第 0 节场景簇（10 类）
export type ScenarioCluster =
  | 'destination_travel'
  | 'milestone_event'
  | 'aesthetic_lifestyle'
  | 'fantasy_play'
  | 'seasonal_festival'
  | 'object_anchor'
  | 'luxury_editorial'
  | 'role_identity'
  | 'relationship_life_event'
  | 'body_transformation';

// 1.3 六类连贯逻辑（仅 time_arc 允许以时间推进为核心结构）
export type CoherenceType =
  | 'time_arc'
  | 'object_anchor'
  | 'status_facets'
  | 'event_arc'
  | 'aesthetic_series'
  | 'fantasy_variations';

// 5.2.1 IntentRewriter 改写原因
export type RewriteReason =
  | 'none'
  | 'proof_to_editorial'
  | 'ownership_to_lifestyle'
  | 'specific_identity_to_style'
  | 'deception_to_imagined'
  | 'brand_or_org_to_generic'
  | 'blocked';

// 5.2.2 PromptModeration
export type ModerationDecision = 'allow' | 'flag' | 'deny';
export type ModerationReason =
  | 'impersonation'
  | 'adult'
  | 'violence'
  | 'deception_or_proof'
  | 'minor_safety'
  | 'unknown';

export type FailReason = 'identity' | 'realism';

// ScenePlanner 分类结果
export type ModerationAction = 'allow' | 'rewrite' | 'block';
export interface SceneClassification {
  scenario_cluster: ScenarioCluster;
  risk_level: RiskLevel;
  coherence_type: CoherenceType;
  moderation_action: ModerationAction;
}

// 消歧选择题（点选，不打字；不含张数）
export interface ClarifyingQuestionOption {
  id: string;
  label: string;
}
export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: ClarifyingQuestionOption[];
}

// 每帧规格
export type ShotSize = 'wide' | 'medium' | 'close';
export interface ShotSpec {
  index: number;
  narrative_role: string;
  summary: string;
  shot_size: ShotSize;
  face_orientation: string;
  lighting: string;
  is_candid: boolean;
  // 每帧独立的微表情描述（"mid-stride exhale" / "half-smile, glancing aside"）。
  // 组内 outfit 一致是对的，但表情统一会让 6 张看起来假；每帧必须有 distinct beat。
  expression_beat?: string;
  image_prompt: string; // 英文完整 prompt，LLM 写，用户永不接触
  // 展示用一句话场景概述（弹幕 + 结果页 lightbox 用）。跟随用户【输入语言】：
  // 输入中文→中文，英文→英文，其它语种→对应语种。由 buildScenePlan 据 rawPrompt 本地化生成。
  // 缺省时前端回退到 `narrative_role · summary`（英文）。
  caption?: string;
}

// ── 故事线领域类型(v2:故事线分解机制)──────────────

// 8 类故事线原型(决定"6 个场景靠什么串联")
export type StorylineType =
  | 'journey'          // 旅程体验:时间线
  | 'ownership_flex'   // 拥有炫耀:物体环绕
  | 'fantasy_role'     // 幻想角色:名场面集锦
  | 'milestone_event'  // 高光事件:事件弧
  | 'profession'       // 职业身份:身份切面
  | 'lifestyle'        // 生活美学:主题变奏
  | 'seasonal'         // 节日季节:氛围铺陈
  | 'transformation';  // 蜕变成长:对比弧

// 拍摄视角(AI 按场景自动分配)
export type ShotPerspective = 'selfie' | 'friend_candid';

// 故事线的一个节拍 = 一个独立场景
export interface StoryBeat {
  index: number;
  scene_title: string;                 // 简短场景名,如"鲸鱼浮出喷水的瞬间"
  setting: string;                     // 具体地点/环境(每帧必须不同)
  activity: string;                    // 在干什么
  shot_perspective: ShotPerspective;   // selfie | friend_candid
  shot_size: ShotSize;                 // wide | medium(不用 close)
  face_orientation?: 'front' | 'three_quarter' | 'profile' | 'back_view'; // 大部分 front/three_quarter, ≤2/6 profile/back_view (rule 11)
  wardrobe: 'main' | string;           // 'main' 或 "change:晚礼服"
  expression_beat: string;             // 本帧微表情
  is_highlight?: boolean;              // 高潮/惊喜帧
  companion?: string;                  // 陪伴修饰(第二人不露正脸),如 "背影同框的朋友";无则省略
}

export type Era = 'modern' | 'historical' | 'fantasy' | 'future';

export interface SceneAttire {
  outfit: string;     // 类型适配:古代→盔甲战袍;医生→白大褂;婚礼→婚纱
  hairstyle: string;
  accessory: string;  // 古代→佩剑;现代→crossbody包;正式→none
}

export interface StorylineConstraints {
  era: Era;
  allowSelfie: boolean;
  allowModernProps: boolean;
}

// 调性(问答 Q1 用)
export interface SceneTone {
  id: string;
  label: string;          // 中文展示名
  emoji: string;
  promptFragment: string; // 注入故事线生成的英文调性指令
}

// 锚定物体（直升机/法拉利/手表/狗/...）的视觉规格。
// 当用户 prompt 出现 "I bought / my / I own X" 这类核心物体时必须填，
// 否则组内每帧 LLM 会独立想象，导致颜色/型号/编号不一致（一眼假）。
export interface AnchorObject {
  // 显式名字（"helicopter"、"Ferrari 488"），用于在 prompt 里 verbatim 重复
  name: string;
  // 具体视觉特征：颜色、材质、型号、识别标记（"matte black, white interior, tail number N847"）
  appearance: string;
}

// 组一致性约束。每个字段都必须显式填写具体内容（颜色/材质/侧别等），
// 否则 LLM 每帧自由发挥就会出现包颜色变 / 项链突然出现 / 头发披散去跑步 这类硬伤。
export interface SceneContinuity {
  // 衣着（颜色 + 款式）："black athletic tank top with thin straps, fitted black leggings"
  outfit: string;
  // 单一配饰（颜色 + 材质 + 哪一侧）："small black nylon crossbody bag worn on the right hip"
  // 不要包含项链/手表，那些走 jewelry 字段。
  accessory: string;
  // 头发（绝对锁定）："long blonde hair tied in a high ponytail"。
  // 跑步/游泳/瑜伽等动作场景必须扎起（activity-aware styling）。
  hairstyle: string;
  // 首饰（绝对锁定）：要么 "no jewelry"，要么显式列出（"thin gold chain necklace only, no rings, no earrings"）。
  // 不允许 LLM 自由发挥，否则 6 张里某一张会突然带项链/耳环。
  jewelry: string;
  // 鞋子：颜色 + 类型（"white Nike running shoes" / "tan leather ankle boots"）
  shoes: string;
  // 相机口径
  camera_style: string;
  // 调色/光感
  film_look: string;
  // optional：仅在用户提到核心物体时填，由 ScenePlanner 强制锁定
  anchor_object?: AnchorObject;
}

// scene_plan（jsonb）——路径 B、将来路径 A 模板与 SEO 场景页共用
export interface ScenePlan {
  scenario: string;
  scenario_cluster: ScenarioCluster;
  risk_level: RiskLevel;
  coherence_type: CoherenceType;
  title: string;
  set_premise: string;
  set_structure: string[];
  continuity: SceneContinuity;
  shots: ShotSpec[];
}

// 基准身份信息，用完按隐私清理
export interface IdentityRef {
  selfieUrls: string[];
}

// 自拍画像（upload 阶段由 face-check 视觉 LLM 顺带识别）。
// 用作"造型优先级链"的第②层默认值：当用户没在场景里对发型/外貌提明确诉求时，
// 发型与性别化穿搭以这份画像为准（短发就短发、男生就男生），不再写死长发女性。
// 全部 optional：识别失败 / 无 key / dev 时为空，下游回退到"以参考自拍为准"的措辞。
export interface SelfieAppearance {
  gender?: 'male' | 'female' | 'unclear';
  hairLength?: 'short' | 'medium' | 'long';
  // 简短发型描述（颜色 + 卷直 + 怎么戴），如 "short black straight hair" / "long wavy brown hair"
  hairDesc?: string;
}

// ---- service IO ----

export interface RewriteResult {
  safePrompt: string;
  rewriteApplied: boolean;
  rewriteReason: RewriteReason;
  userNotice?: string;
}

export interface ModerationResult {
  decision: ModerationDecision;
  reason?: ModerationReason;
  userMessage: string;
}

export interface UploadGateResult {
  ok: boolean;
  issues: string[];
  hint?: string;
}

// 5.5 单帧质检（豆包视觉一次判像+真）
export interface QualityResult {
  same_person: boolean;
  deformity: boolean;
  plastic_skin: boolean;
  quality: number; // 1–5
  issues: string[];
}

// IdentityCheck（vlm | volcano_face）
export interface IdentityResult {
  same: boolean;
  score?: number;
}

// 5.6 组一致性质检
export interface SetCoherenceResult {
  same_person_across_set: boolean;
  outfit_consistent: boolean;
  visual_style_consistent: boolean;
  coherence_type_followed: boolean;
  duplicate_compositions: boolean;
  deceptive_or_proof_like: boolean;
  set_quality: number; // 1–5
  weak_frames: number[]; // 帧 index
}

// 一组出图请求里单帧的最小描述
export interface GenerationShotInput {
  index: number;
  imagePrompt: string;
  narrativeRole: string;
}

// /api/scene/clarify 响应
export interface ClarifyResponse {
  safePrompt: string;
  rewriteApplied: boolean;
  rewriteReason: RewriteReason;
  userNotice?: string;
  classification: SceneClassification;
  questions: ClarifyingQuestion[];
  rejected?: {
    reason: ModerationReason;
    userMessage: string;
    safeRewriteChips: string[];
  };
}
