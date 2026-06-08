// ScenePlanner（SPEC 5.3）：分类 + 消歧选择题 + 分镜。
// Provider：OpenRouter Gemini 3.1 Flash Lite Preview（multimodal lite, 1M context, 350 tok/s）。
// 有 OPENROUTER_API_KEY → 调 LLM 出 JSON 并校验；无 key / 解析失败 → 走已测的本地 fallback。
import { createOpenRouterChat } from "../../openrouter/chat";
import { sceneConfig, hasTextProviderKey } from "../config";
import { detectAnchorObject, buildContinuityFromAttire, buildFramePromptFromBeat, slugForPlan, titleForPlan, VALID_CLUSTERS, VALID_COHERENCE } from "../scene-plan";
import { generateStoryline } from "./story-line";
import { writeSceneCaptions } from "./caption";
import { SCENE_PLANNER_SYSTEM, classifyInstruction, questionsInstruction, safeAlternativesInstruction, storylineClassifyInstruction } from "../prompts";
import { getStorylineType, STORYLINE_TYPES, SCENE_TONES } from "../../../constants/scene-storylines";
import type {
  SceneClassification,
  ClarifyingQuestion,
  ScenePlan,
  ScenarioCluster,
  CoherenceType,
  RiskLevel,
  StorylineType,
} from "../types";

function parseJson<T>(content: string): T | null {
  const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function llmJson<T>(user: string): Promise<T | null> {
  if (!hasTextProviderKey()) return null;
  try {
    const text = await createOpenRouterChat(
      [
        { role: "system", content: SCENE_PLANNER_SYSTEM },
        { role: "user", content: user },
      ],
      { temperature: 0.7, max_tokens: 2048, model: sceneConfig.textModel, reasoningEffort: "minimal" },
    );
    return parseJson<T>(text ?? "");
  } catch {
    return null;
  }
}

function isClassification(x: unknown): x is SceneClassification {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return (
    VALID_CLUSTERS.includes(c.scenario_cluster as ScenarioCluster) &&
    VALID_COHERENCE.includes(c.coherence_type as CoherenceType) &&
    ["low", "medium", "high", "blocked"].includes(c.risk_level as string)
  );
}

const CLUSTER_RULES: { test: RegExp; cluster: ScenarioCluster; coherence: CoherenceType }[] = [
  { test: /dubai|tokyo|paris|bali|london|travel|trip|\bcity\b|beach|resort|vacation/i, cluster: "destination_travel", coherence: "time_arc" },
  { test: /graduation|wedding|award|opening|launch|anniversary|magazine cover/i, cluster: "milestone_event", coherence: "event_arc" },
  { test: /\bceo\b|office|chef|pilot|founder|executive|doctor|lawyer/i, cluster: "role_identity", coherence: "status_facets" },
  { test: /retro|90s|80s|fantasy|cinematic|action figure|red carpet|movie/i, cluster: "fantasy_play", coherence: "fantasy_variations" },
  { test: /christmas|halloween|new year|festival|holiday season|birthday weekend/i, cluster: "seasonal_festival", coherence: "aesthetic_series" },
  { test: /luxury|yacht|supercar|mansion|first[- ]class|private[- ]jet/i, cluster: "luxury_editorial", coherence: "status_facets" },
  { test: /cafe|coffee|morning|cottagecore|soft life|apartment|slow living/i, cluster: "aesthetic_lifestyle", coherence: "aesthetic_series" },
];

function fallbackClassify(safePrompt: string): SceneClassification {
  const hit = CLUSTER_RULES.find(r => r.test.test(safePrompt));
  const cluster = hit?.cluster ?? "aesthetic_lifestyle";
  const coherence = hit?.coherence ?? "aesthetic_series";
  const risk: RiskLevel = cluster === "luxury_editorial" || cluster === "role_identity" ? "medium" : "low";
  return { scenario_cluster: cluster, risk_level: risk, coherence_type: coherence, moderation_action: "allow" };
}

export async function classifyScene(safePrompt: string): Promise<SceneClassification> {
  const llm = await llmJson<SceneClassification>(classifyInstruction(safePrompt));
  const base = llm && isClassification(llm) ? llm : fallbackClassify(safePrompt);
  // anchor 物体（直升机/跑车/游艇/...）场景：强制 object_anchor coherence，
  // 确保走载具故事弧 + 专属问题（避免被 LLM 分到 status_facets 而问出"现代办公室"这种不相干选项）。
  if (detectAnchorObject(safePrompt)) {
    return { ...base, scenario_cluster: "object_anchor", coherence_type: "object_anchor" };
  }
  return base;
}

// 按 coherence_type 动态生成的消歧选择题（dev fallback；SPEC 第 4 节）
// 每个 coherence 固定 3 问（覆盖 3 个独立维度），LLM 路径会生成自己的 3 问，此处是兜底。
const QUESTION_BANK: Record<CoherenceType, ClarifyingQuestion[]> = {
  time_arc: [
    { id: "mood", question: "What's the overall vibe?", options: [{ id: "relaxed", label: "Relaxed & candid" }, { id: "glam", label: "Glam & polished" }, { id: "adventurous", label: "Adventurous" }] },
    { id: "time", question: "What time of day feels right?", options: [{ id: "morning", label: "Morning light" }, { id: "golden", label: "Golden hour" }, { id: "night", label: "Night out" }] },
    { id: "pace", question: "What's the pace of the day?", options: [{ id: "slow", label: "Slow & easy" }, { id: "packed", label: "Packed & adventurous" }, { id: "mixed", label: "A bit of both" }] },
  ],
  event_arc: [
    { id: "stage", question: "Which moment matters most?", options: [{ id: "prep", label: "Getting ready" }, { id: "peak", label: "The big moment" }, { id: "after", label: "Celebrating after" }] },
    { id: "emotion", question: "What's the emotion?", options: [{ id: "joyful", label: "Joyful" }, { id: "proud", label: "Proud & poised" }, { id: "intimate", label: "Intimate" }] },
    { id: "company", question: "Who's in the scene with you?", options: [{ id: "solo", label: "Just me" }, { id: "friends", label: "With friends" }, { id: "crowd", label: "A whole crowd" }] },
  ],
  status_facets: [
    { id: "persona", question: "What's the persona?", options: [{ id: "powerful", label: "Powerful & sharp" }, { id: "approachable", label: "Warm & approachable" }, { id: "visionary", label: "Visionary" }] },
    { id: "setting", question: "Where does it play out?", options: [{ id: "office", label: "Modern office" }, { id: "city", label: "City backdrop" }, { id: "studio", label: "Editorial studio" }] },
    { id: "tone", question: "What's the tone?", options: [{ id: "formal", label: "Sharp & formal" }, { id: "creative", label: "Creative & relaxed" }, { id: "bold", label: "Bold & striking" }] },
  ],
  aesthetic_series: [
    { id: "aesthetic", question: "Pick the aesthetic direction.", options: [{ id: "soft", label: "Soft & warm" }, { id: "minimal", label: "Clean & minimal" }, { id: "vintage", label: "Vintage film" }] },
    { id: "palette", question: "Which color palette?", options: [{ id: "neutral", label: "Warm neutrals" }, { id: "earthy", label: "Earthy tones" }, { id: "cool", label: "Cool & airy" }] },
    { id: "mood", question: "Overall mood?", options: [{ id: "cozy", label: "Cozy & intimate" }, { id: "fresh", label: "Fresh & airy" }, { id: "moody", label: "Moody & dramatic" }] },
  ],
  fantasy_variations: [
    { id: "world", question: "Which world / era?", options: [{ id: "retro", label: "Retro decade" }, { id: "cinematic", label: "Cinematic fantasy" }, { id: "editorial", label: "High-fashion editorial" }] },
    { id: "feel", question: "How real should it feel?", options: [{ id: "real", label: "Photoreal" }, { id: "stylized", label: "Stylized" }, { id: "dreamy", label: "Dreamy" }] },
    { id: "palette", question: "Which color palette?", options: [{ id: "vivid", label: "Vivid & saturated" }, { id: "muted", label: "Muted & filmic" }, { id: "mono", label: "Moody monochrome" }] },
  ],
  // 物体/载具场景：问"故事怎么展开 / 情绪 / 拍摄视角"，而不是无关的地点。
  object_anchor: [
    { id: "story_arc", question: "Which moments should the set capture?", options: [{ id: "full_journey", label: "The full journey — approach, boarding, riding, landing" }, { id: "in_action", label: "Mostly in action — using / driving / flying it" }, { id: "arrival", label: "The arrival & first reveal" }] },
    { id: "emotion", question: "What's the emotion?", options: [{ id: "thrilled", label: "Thrilled & excited" }, { id: "composed", label: "Cool & in control" }, { id: "relaxed", label: "Relaxed & enjoying it" }] },
    { id: "camera_angle", question: "How was it shot?", options: [{ id: "friend", label: "A friend tagging along" }, { id: "follow", label: "Someone following the action" }, { id: "cinematic", label: "Cinematic third-person" }] },
  ],
};

export async function generateClarifyingQuestions(
  safePrompt: string,
  classification: SceneClassification,
): Promise<ClarifyingQuestion[]> {
  const llm = await llmJson<{ questions: ClarifyingQuestion[] }>(questionsInstruction(safePrompt, classification));
  if (llm?.questions?.length) return llm.questions.slice(0, 3);
  return QUESTION_BANK[classification.coherence_type] ?? QUESTION_BANK.aesthetic_series;
}

// 两段式分镜(v2)：① analyzeInput 判故事线类型 + 调性/侧重 → ② generateStoryline 出
// N 个不同场景的 StoryBeat → buildFramePromptFromBeat 逐帧成 prompt。
// answers 形如 { tone?, focus?, companion? }(值可为 id 或中文 label)；旧的多余键忽略。
export async function buildScenePlan(
  safePrompt: string,
  answers: Record<string, string>,
  shotCount: number,
  // 用户的原始输入（未翻译）。用于把展示用 caption 本地化成用户的输入语言。
  // 不传则用 safePrompt（多为英文 → caption 保持英文）。
  rawPrompt?: string,
): Promise<ScenePlan> {
  const analysis = await analyzeInput(safePrompt);
  const def = storylineDef(analysis.storyline_type);

  const toneId = resolveToneId(answers.tone) ?? analysis.tone_suggestions[0] ?? SCENE_TONES[0].id;
  const focusId = resolveFocusId(def, answers.focus) ?? def.focusOptions[0].id;
  const companion = answers.companion?.trim() || null;

  const { attire, beats } = await generateStoryline({
    safePrompt,
    storylineType: def.id,
    toneId,
    focusId,
    shotCount,
    companion,
  });
  const constraints = { era: def.era, allowSelfie: def.allowSelfie, allowModernProps: def.allowModernProps };
  const continuity = buildContinuityFromAttire(attire, safePrompt);

  const shots = beats.map(b => ({
    index: b.index,
    narrative_role: b.scene_title,
    summary: b.setting,
    shot_size: b.shot_size,
    face_orientation: b.face_orientation ?? "three_quarter",
    lighting: "natural light",
    is_candid: true,
    expression_beat: b.expression_beat,
    image_prompt: buildFramePromptFromBeat(safePrompt, b, continuity, constraints),
    caption: "" as string,
  }));

  // 展示用 caption：把【已丰富的 6 个场景】各提炼成 1 句爆款钩子（用户语言 + 所选 tone 语感）。
  // 注意：caption 只给用户看（弹幕 + 结果页图片下方），不参与出图；出图仍用上面的丰富 image_prompt。
  const captions = await writeSceneCaptions(beats, toneId, rawPrompt ?? safePrompt);
  shots.forEach((s, i) => {
    s.caption = (captions[i] || s.narrative_role || s.summary || "").trim();
  });

  return {
    scenario: slugForPlan(safePrompt),
    scenario_cluster: "aesthetic_lifestyle",
    risk_level: "low",
    coherence_type: "aesthetic_series",
    title: titleForPlan(safePrompt),
    set_premise: `A storyline photo set of: ${safePrompt}`,
    set_structure: beats.map(b => b.scene_title),
    continuity,
    shots,
  };
}

// answers.tone 可为调性 id 或中文 label；都解析到合法 id，否则 null（交回默认预选）。
function resolveToneId(v?: string): string | null {
  if (!v) return null;
  return SCENE_TONES.find(t => t.id === v)?.id ?? SCENE_TONES.find(t => t.label === v)?.id ?? null;
}

// answers.focus 可为侧重 id 或 label；解析到该故事线类型的合法侧重 id，否则 null。
function resolveFocusId(def: ReturnType<typeof storylineDef>, v?: string): string | null {
  if (!v) return null;
  return def.focusOptions.find(f => f.id === v || f.label === v)?.id ?? null;
}

export interface InputAnalysis {
  storyline_type: StorylineType;
  tone_suggestions: string[];               // 推荐的调性 id(1 个)
  focus_options: { id: string; label: string }[]; // Q2 侧重选项(该类专属)
}

// LLM 语义分类：把 safePrompt 归到 8 类故事线之一,识别真实意图(中英文皆可)。
// 无 key / 失败 / 非法返回 → null,由 analyzeInput 走正则 fallback。
async function classifyStorylineLLM(safePrompt: string): Promise<StorylineType | null> {
  const types = STORYLINE_TYPES.map(t => ({ id: t.id, logic: t.organizingLogic }));
  const out = await llmJson<{ storyline_type: string }>(storylineClassifyInstruction(safePrompt, types));
  const id = out?.storyline_type;
  return id && STORYLINE_TYPES.some(s => s.id === id) ? (id as StorylineType) : null;
}

// 分析用户输入:判故事线类型 + 调性预选 + 侧重选项。
export async function analyzeInput(safePrompt: string): Promise<InputAnalysis> {
  // LLM 语义分类(中英文、识别真实意图);失败/无 key/非法 → 正则 fallback(getStorylineType)。
  const llmType = await classifyStorylineLLM(safePrompt);
  const typeDef = llmType ? storylineDef(llmType) : getStorylineType(safePrompt);
  return {
    storyline_type: typeDef.id,
    tone_suggestions: typeDef.toneBias.slice(0, 1), // 只荐 1 个(UI 去金边 + 角标"推荐")
    focus_options: typeDef.focusOptions,
  };
}

// 按 id 拿故事线类型定义(buildScenePlan 用)
export function storylineDef(id: StorylineType) {
  return STORYLINE_TYPES.find(s => s.id === id) ?? STORYLINE_TYPES.find(s => s.id === "journey")!;
}

// 被拒场景的针对性安全替代；LLM 失败/空 → null（调用方回退硬编码）。
export async function generateSafeAlternatives(rawPrompt: string): Promise<string[] | null> {
  const out = await llmJson<{ alternatives: string[] }>(safeAlternativesInstruction(rawPrompt));
  const a = out?.alternatives;
  return Array.isArray(a) && a.length ? a.slice(0, 3) : null;
}
