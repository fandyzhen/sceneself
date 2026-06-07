// scene_plan 的纯逻辑：fallback continuity 构造、dev-fallback 构造器、结构校验、单帧 prompt(v2)。
// 这些不依赖 LLM/外部服务，可独立测试；ScenePlanner 与故事线引擎都复用它们。
import type {
  ScenePlan,
  ShotSpec,
  SceneClassification,
  CoherenceType,
  ScenarioCluster,
  SceneContinuity,
  StoryBeat,
  StorylineConstraints,
} from "./types";
import { fallbackStoryline } from "./services/story-line";

export const VALID_CLUSTERS: ScenarioCluster[] = [
  "destination_travel",
  "milestone_event",
  "aesthetic_lifestyle",
  "fantasy_play",
  "seasonal_festival",
  "object_anchor",
  "luxury_editorial",
  "role_identity",
  "relationship_life_event",
  "body_transformation",
];

export const VALID_COHERENCE: CoherenceType[] = [
  "time_arc",
  "object_anchor",
  "status_facets",
  "event_arc",
  "aesthetic_series",
  "fantasy_variations",
];

// ── Anchor object 检测（SPEC：组内核心物体一致性） ──────────────────────
// 用户提到"I bought / my / I own X"时，把 X 锁进 continuity.anchor_object，
// 让每帧 image_prompt 引用同一个视觉规格，避免颜色/型号不一致。

interface AnchorPattern {
  name: string;
  appearance: string;
  test: RegExp;
}

// 知名物体的标准外观规格（颜色/材质/识别标记），用于强一致 prompt。
// MVP 列覆盖最常见的"flex object"，未命中走通用兜底。
const ANCHOR_PATTERNS: AnchorPattern[] = [
  { name: "Robinson R44 helicopter", appearance: "matte black body with white pinstripe, glossy black rotors, white leather interior, tail number visible", test: /\bhelicopter\b/i },
  { name: "private jet (Gulfstream-style)", appearance: "polished white fuselage with metallic blue stripe, chrome trim, two engines under the tail", test: /\b(private\s+jet|gulfstream|learjet|cessna citation)\b/i },
  { name: "Ferrari 488", appearance: "Rosso Corsa red, matte black wheels, yellow Ferrari badge on the front hood, scissor-style side intake", test: /\bferrari\b/i },
  { name: "Lamborghini Huracán", appearance: "matte arancio (orange) paint, black diamond-cut wheels, sharp angular bodywork, signature Y-shaped headlights", test: /\b(lamborghini|lambo)\b/i },
  { name: "Porsche 911", appearance: "guards red with silver Porsche badge, round headlights, classic sloping roofline, black leather interior", test: /\bporsche\b/i },
  { name: "Rolex Daytona watch", appearance: "stainless steel case, white panda dial with three black sub-dials, ceramic bezel, jubilee bracelet", test: /\brolex(\s+\w+)?\b/i },
  { name: "private yacht", appearance: "glossy white hull with teak wood deck, gold trim along the railings, name 'Aurora' painted on the stern", test: /\byacht\b/i },
];

const GENERIC_VEHICLE_OWN = /\bI\s+(bought|own)\s+a\s+([a-zA-Z][a-zA-Z0-9\- ]{2,40})/i;

export function detectAnchorObject(safePrompt: string): { name: string; appearance: string } | null {
  for (const p of ANCHOR_PATTERNS) {
    if (p.test.test(safePrompt)) return { name: p.name, appearance: p.appearance };
  }
  // 通用兜底：捕获用户写出的物体名，给一个通用的"详细外观"指令，
  // 让 ScenePlanner / Seedream 至少知道这是组内必须保持一致的核心物体。
  const m = safePrompt.match(GENERIC_VEHICLE_OWN);
  if (m && m[2]) {
    const obj = m[2].trim().replace(/\s+/g, " ").slice(0, 40);
    if (obj.length >= 3) {
      return {
        name: obj,
        appearance: `the exact same ${obj} in every photo: same color, same material, same identifying marks — describe its color and surface details concretely and keep them identical across the set`,
      };
    }
  }
  return null;
}

// ── Activity-aware styling（SPEC 真实性）：跑步该扎头发，游泳该穿泳装 ────
// 关键词检测 → 推断活动 → 推 hairstyle / outfit / shoes 的合理默认值。
// LLM 路径走 SCENE_PLANNER_SYSTEM 的指令；这里是 fallback 路径的兜底。

export type Activity =
  | "running"
  | "swimming"
  | "biking"
  | "yoga"
  | "cooking"
  | "formal_event"
  | "beach"
  | "hiking";

// Activity 关键词。"run" 必须在 "running" 之外单独命中（翻译后中文跑步常变 "run in the park"），
// 但要排除 "run for office / run a business" 这类动词转义。
const ACTIVITY_RULES: { test: RegExp; activity: Activity }[] = [
  // "run/running/runner/runners/jog/jogging/marathon/sprint" — 但不命中 "run a/an" / "run for"
  { test: /\b(running|runner|runners|jog|jogging|marathon|sprint)\b/i, activity: "running" },
  { test: /\brun(?!\s+(a|an|for|the\s+show|the\s+business|by|into)\b)\b/i, activity: "running" },
  { test: /\b(swimming|swim|pool|beach\s+swim)\b/i, activity: "swimming" },
  { test: /\b(biking|cycling|bike\s+ride|bicycle)\b/i, activity: "biking" },
  { test: /\b(yoga|pilates|stretching)\b/i, activity: "yoga" },
  { test: /\b(cooking|baking|chef\s+at\s+home|in\s+the\s+kitchen)\b/i, activity: "cooking" },
  { test: /\b(black\s+tie|gala|formal\s+event|cocktail\s+party|red\s+carpet)\b/i, activity: "formal_event" },
  { test: /\b(beach|seaside|coast|sunbathing)\b/i, activity: "beach" },
  { test: /\b(hiking|trail|mountain|trekking)\b/i, activity: "hiking" },
];

export function detectActivity(safePrompt: string): Activity | null {
  for (const r of ACTIVITY_RULES) {
    if (r.test.test(safePrompt)) return r.activity;
  }
  return null;
}

interface ActivityStyling {
  outfit: string;
  hairstyle: string;
  shoes: string;
  jewelry: string;
  accessory: string;
}

const ACTIVITY_STYLING: Record<Activity, ActivityStyling> = {
  running: {
    // 强 outfit lock：明确说覆盖肚皮（不是 crop top），高腰 leggings 完整覆盖到肚脐上方。
    outfit: "black athletic tank top with thin straps and full midriff coverage (NOT cropped, no exposed belly, hem reaches the high-waist leggings), fitted black high-waist running leggings covering from waist to ankle",
    hairstyle: "long hair tied in a high ponytail (no loose strands)",
    shoes: "white running shoes with subtle gray accents",
    jewelry: "no jewelry (no necklace, no rings, no dangling earrings)",
    // 强 belt position lock：明确"始终在腰前正中"，禁止后背 / 两侧漂移。
    accessory: "small black nylon running belt worn snugly centered in front of the waist (always in front, never on the back or sides, position never changes between photos)",
  },
  swimming: {
    outfit: "simple one-piece black swimsuit",
    hairstyle: "wet hair slicked back, damp from the water",
    shoes: "barefoot",
    jewelry: "no jewelry",
    accessory: "a white towel draped over the right shoulder",
  },
  biking: {
    outfit: "fitted cycling jersey and padded shorts in matching dark navy",
    hairstyle: "hair tied back under a black bike helmet (helmet always on)",
    shoes: "black cycling shoes with white soles",
    jewelry: "no jewelry",
    accessory: "small black hydration pack worn on the back",
  },
  yoga: {
    outfit: "fitted cropped athletic top and high-waist leggings in matching sage green",
    hairstyle: "hair tied in a low bun",
    shoes: "barefoot",
    jewelry: "no jewelry (no rings, no necklace)",
    accessory: "a rolled lavender yoga mat carried under the left arm",
  },
  cooking: {
    outfit: "simple white cotton t-shirt with rolled sleeves, dark blue denim jeans",
    hairstyle: "hair tied back in a loose low ponytail",
    shoes: "white minimal sneakers (out of frame most of the time)",
    jewelry: "thin gold chain necklace only (no rings — hands are working)",
    accessory: "a beige linen apron tied around the waist",
  },
  formal_event: {
    outfit: "elegant black cocktail dress with thin straps, knee-length",
    hairstyle: "hair styled in soft waves, half-up",
    shoes: "classic black pointed-toe heels",
    jewelry: "pearl stud earrings and a thin silver bracelet on the left wrist",
    accessory: "small black satin clutch held in the right hand",
  },
  beach: {
    outfit: "white linen button-up shirt unbuttoned over a black bikini top, denim shorts",
    hairstyle: "loose beach waves",
    shoes: "tan leather flat sandals",
    jewelry: "thin gold ankle bracelet on the right ankle, no other jewelry",
    accessory: "woven straw tote bag carried on the right shoulder",
  },
  hiking: {
    outfit: "olive green technical t-shirt, beige cargo hiking pants",
    hairstyle: "hair tied in a French braid",
    shoes: "brown leather hiking boots with thick soles",
    jewelry: "no jewelry",
    accessory: "small gray daypack worn on both shoulders",
  },
};

export function hairstyleForActivity(activity: Activity): string {
  return ACTIVITY_STYLING[activity].hairstyle;
}

// 默认 styling（无活动检测命中时使用）：lifestyle-casual，明确锁定 hair / jewelry / shoes。
const DEFAULT_STYLING: ActivityStyling = {
  outfit: "cream knit sweater and high-waist dark jeans",
  hairstyle: "long hair loose with a slight wave",
  shoes: "white low-top canvas sneakers",
  jewelry: "thin gold chain necklace only, no rings, no earrings",
  accessory: "small tan leather crossbody bag worn over the right shoulder",
};

// ── User answer 颜色覆盖 ─────────────────────
// 用户在 clarify 阶段回答（other 框）输入"芭比粉"/"barbie pink"等，
// 必须覆盖 ACTIVITY_STYLING 的硬编码颜色（原 bug：完全忽略）。
const COLOR_PATTERNS: { test: RegExp; canonical: string }[] = [
  { test: /芭比粉|蜜桃粉|玫瑰粉|樱花粉|粉(色|红|色调)?/, canonical: "" }, // 中文匹配后保留原词
  { test: /红色|大红|酒红|枣红/, canonical: "" },
  { test: /蓝色|海军蓝|天蓝|浅蓝/, canonical: "" },
  { test: /绿色|薄荷绿|墨绿|军绿/, canonical: "" },
  { test: /黄色|姜黄|柠檬黄/, canonical: "" },
  { test: /紫色|薰衣草|藕粉/, canonical: "" },
  { test: /橙色|橘色/, canonical: "" },
  { test: /黑色/, canonical: "" },
  { test: /白色|米白|奶白/, canonical: "" },
  { test: /灰色/, canonical: "" },
  { test: /棕色|咖啡色|焦糖色/, canonical: "" },
  { test: /(barbie\s+pink|hot\s+pink|baby\s+pink|millennial\s+pink|blush\s+pink|pink)/i, canonical: "" },
  { test: /(navy\s+blue|sky\s+blue|powder\s+blue|royal\s+blue|baby\s+blue|blue)/i, canonical: "" },
  { test: /(sage\s+green|mint\s+green|olive\s+green|forest\s+green|emerald\s+green|green)/i, canonical: "" },
  { test: /(burgundy|crimson|cherry\s+red|red)/i, canonical: "" },
  { test: /(mustard\s+yellow|lemon\s+yellow|yellow)/i, canonical: "" },
  { test: /(lavender|lilac|violet|purple)/i, canonical: "" },
  { test: /(coral|peach|orange)/i, canonical: "" },
  { test: /(black)/i, canonical: "" },
  { test: /(ivory|cream|off-white|white)/i, canonical: "" },
  { test: /(grey|gray|charcoal)/i, canonical: "" },
  { test: /(camel|tan|caramel|brown)/i, canonical: "" },
];

/** 扫所有 answer 值，返回第一个识别到的颜色短语（保留原文，让 prompt 用户自定义优先） */
export function extractColorAnswer(answers: Record<string, string>): string | null {
  for (const value of Object.values(answers ?? {})) {
    if (!value || typeof value !== "string") continue;
    for (const p of COLOR_PATTERNS) {
      const match = value.match(p.test);
      if (match) return match[0].trim();
    }
  }
  return null;
}

// 把 styling 文案中的所有内置颜色词替换为用户颜色。
// 例："black athletic tank top with thin straps, fitted black running leggings"
//      → "芭比粉 athletic tank top with thin straps, fitted 芭比粉 running leggings"
const COLOR_REPLACE_REGEX = /\b(black|white|navy|red|blue|green|pink|sage|olive|beige|tan|cream|brown|gray|grey)\b/gi;
function applyColorOverride(styling: ActivityStyling, userColor: string): ActivityStyling {
  const replace = (s: string) => s.replace(COLOR_REPLACE_REGEX, userColor);
  return {
    outfit: replace(styling.outfit),
    hairstyle: styling.hairstyle, // 头发不替换
    shoes: styling.shoes, // 鞋子保留原色（鞋型与颜色搭配通常固定）
    jewelry: styling.jewelry,
    accessory: replace(styling.accessory),
  };
}

// snake_case scenario id / Title Case 标题（buildScenePlan 与 fallback 复用）。
export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "scene_set";

export const titleCase = (s: string) =>
  s.replace(/\b\w/g, m => m.toUpperCase()).slice(0, 80);

// 导出别名（buildScenePlan v2 用这两个名字，避免与本文件内部短名冲突）
export const slugForPlan = slug;
export const titleForPlan = titleCase;

// ── buildContinuityFromAttire（LLM attire → 完整 SceneContinuity）──────────
// 把 generateStoryline 返回的 type-appropriate attire 合成完整 SceneContinuity。
// 补全 jewelry / shoes / camera_style / film_look 四个 LLM 不输出的字段，
// 以及可选的 anchor_object（从 safePrompt 检测）。
import type { SceneAttire } from "./types";

export function buildContinuityFromAttire(attire: SceneAttire, safePrompt: string): SceneContinuity {
  const anchor = detectAnchorObject(safePrompt);
  return {
    outfit: attire.outfit,
    hairstyle: attire.hairstyle,
    accessory: attire.accessory,
    // 明确禁止,不留 "implies" 这种哲学留白(图模型会自由加项链/手镯导致组内不一致)。
    jewelry: "ABSOLUTELY no extra jewelry — no necklace, no earrings, no rings, no bracelets, no watch unless the outfit string above explicitly lists one",
    // 鞋子归 outfit 字符串管(attire 已要求把鞋列进去);此字段只兜底,避免冲突。
    shoes: "shoes are part of the outfit string above — do not add any extra footwear",
    camera_style: "iPhone main camera, auto HDR, 4:5 portrait, slight JPEG compression",
    film_look: "natural daylight, candid, visible skin texture, no studio lighting, no airbrushing",
    ...(anchor ? { anchor_object: anchor } : {}),
  };
}

// ── Fallback continuity（无 LLM 时的组一致性约束）─────────────────────
// 据活动检测推 ACTIVITY_STYLING（跑步扎头发 / 锁腰包位置 / 无饰品等），
// 命中用户颜色答案则覆盖 outfit/accessory 颜色，命中 anchor 物体则锁定其外观。
// 故事线引擎(buildScenePlan v2) 与 dev-fallback(buildFallbackScenePlan) 共用。
export function buildFallbackContinuity(
  safePrompt: string,
  answers: Record<string, string>,
): SceneContinuity {
  const activity = detectActivity(safePrompt);
  let styling = activity ? ACTIVITY_STYLING[activity] : DEFAULT_STYLING;
  // 用户答案中的颜色优先（other 框输入"芭比粉"/"barbie pink"等覆盖内置色）
  const userColor = extractColorAnswer(answers ?? {});
  if (userColor) {
    styling = applyColorOverride(styling, userColor);
  }
  const anchor = detectAnchorObject(safePrompt);
  return {
    outfit: styling.outfit,
    accessory: styling.accessory,
    hairstyle: styling.hairstyle,
    jewelry: styling.jewelry,
    shoes: styling.shoes,
    // 强 phone-snapshot 口径（避免"vintage film"被模型理解成专业相机）
    camera_style: "iPhone main camera, auto HDR, 4:5 portrait, slight JPEG compression",
    film_look: "natural daylight, candid, visible pores and real skin texture, no studio lighting, no airbrushing, occasional mild motion blur or lens flare",
    ...(anchor ? { anchor_object: anchor } : {}),
  };
}

// dev fallback / 无 LLM 时构造一个合法 scene_plan（基于故事线引擎的同步 fallback）。
// 让 ScenePlanner 的兜底路径、orchestrator 测试夹具都能拿到 N 个不同场景的合法 plan。
export function buildFallbackScenePlan(
  safePrompt: string,
  classification: SceneClassification,
  shotCount: number,
  answers?: Record<string, string>,
): ScenePlan {
  const a = answers ?? {};
  // 同步故事线骨架：N 个明显不同的场景 + 恰一个高潮帧。
  const beats: StoryBeat[] = fallbackStoryline({
    safePrompt,
    storylineType: "journey",
    toneId: "narrative_doc",
    focusId: "scenery",
    shotCount,
    companion: a.companion?.trim() || null,
  }).beats;
  const continuity = buildFallbackContinuity(safePrompt, a);
  const shots: ShotSpec[] = beats.map(b => ({
    index: b.index,
    narrative_role: b.scene_title,
    summary: b.setting,
    shot_size: b.shot_size,
    face_orientation: b.face_orientation ?? "three_quarter",
    lighting: "natural soft light",
    is_candid: true,
    expression_beat: b.expression_beat,
    image_prompt: buildFramePromptFromBeat(safePrompt, b, continuity),
  }));

  return {
    scenario: slug(safePrompt),
    scenario_cluster: classification.scenario_cluster,
    risk_level: classification.risk_level === "blocked" ? "high" : classification.risk_level,
    coherence_type: classification.coherence_type,
    title: titleCase(safePrompt),
    set_premise: `A cohesive AI photo set: ${safePrompt}`,
    set_structure: beats.map(b => b.scene_title),
    continuity,
    shots,
  };
}

export interface ScenePlanValidation {
  valid: boolean;
  errors: string[];
}

export function validateScenePlan(plan: ScenePlan | null | undefined, shotCount: number): ScenePlanValidation {
  const errors: string[] = [];
  if (!plan) return { valid: false, errors: ["missing plan"] };

  if (!VALID_CLUSTERS.includes(plan.scenario_cluster)) errors.push("invalid scenario_cluster");
  if (!VALID_COHERENCE.includes(plan.coherence_type)) errors.push("invalid coherence_type");
  if (!["low", "medium", "high"].includes(plan.risk_level)) errors.push("invalid or blocked risk_level");

  if (!Array.isArray(plan.shots) || plan.shots.length !== shotCount) {
    errors.push("shot count mismatch");
  } else {
    const roles = plan.shots.map(s => s.narrative_role);
    if (new Set(roles).size !== roles.length) errors.push("duplicate narrative roles");
    if (plan.shots.some(s => !s.image_prompt || s.image_prompt.trim() === "")) errors.push("shot missing image_prompt");
  }

  if (!plan.continuity || !plan.continuity.outfit) errors.push("missing continuity.outfit");
  // 锁定核心穿戴（SPEC 真实性）：少了任何一项 LLM 会自由发挥，组内不一致
  if (!plan.continuity?.hairstyle || plan.continuity.hairstyle.trim() === "") errors.push("missing continuity.hairstyle");
  if (!plan.continuity?.jewelry || plan.continuity.jewelry.trim() === "") errors.push("missing continuity.jewelry");
  if (!plan.continuity?.shoes || plan.continuity.shoes.trim() === "") errors.push("missing continuity.shoes");

  // anchor_object 是 optional；填了就必须 name + appearance 都非空
  const anchor = plan.continuity?.anchor_object;
  if (anchor !== undefined) {
    if (!anchor.name || anchor.name.trim() === "") errors.push("anchor_object missing name");
    if (!anchor.appearance || anchor.appearance.trim() === "") errors.push("anchor_object missing appearance");
  }

  return { valid: errors.length === 0, errors };
}

// 含遮挡 outfit（盔甲头盔/连帽/面罩/全脸护具/手术帽/厨师帽/棒球帽等）会压缩人脸识别区,
// 导致 identity 校验失败。实测数据:穿越古代将军场景 67% → 17% 丢帧（修一次后），医生场景 17→33%。
// 对策:检测后(1) face crop 比例下限提高(2) 注入显式露脸指令,不脱掉遮挡件(保设计意图)。
// 覆盖含义:
//   helmets/hoods/visors/balaclavas — 重度遮挡
//   caps/toques/beanies/sun hats/bucket hats — 头顶 + 帽檐阴影（中度）
//   masks — 任何 mask（ski/gas/surgical/face/full-face/sleep）
// 边界:cap 不会误中 cape（\b 阻止 cape 匹配 cap），mask 不会误中 mascara。
const FACE_OCCLUSION_RE = /\b(helmets?|hoods?|visors?|balaclavas?|caps?|toques?|beanies?|sun[- ]?hats?|bucket[- ]?hats?|masks?)\b/i;

export function hasFaceOcclusion(outfit: string): boolean {
  return FACE_OCCLUSION_RE.test(outfit);
}

// StoryBeat → 每帧 image_prompt(v2)。场景用 beat 自己的 setting+activity;
// 视角(自拍/朋友拍)、换装、陪伴(不露脸)按 beat 注入;统一手机随手拍底色。
export function buildFramePromptFromBeat(
  safePrompt: string,
  beat: StoryBeat,
  c: SceneContinuity,
  constraints?: StorylineConstraints,
): string {
  const outfit = beat.wardrobe.startsWith("change:")
    ? beat.wardrobe.slice("change:".length).trim()
    : c.outfit;

  const occluded = hasFaceOcclusion(outfit);

  const perspective = beat.shot_perspective === "selfie"
    ? "shot as a front-camera selfie: the phone IS the camera, so you do NOT see the hand holding the phone and there is NO arm reaching toward the lens; just the subject's face/upper body with the scene behind"
    : "candidly photographed by a friend/bystander from a few meters away — the subject is NOT holding a phone and is not posing for a selfie, acting naturally in the scene";

  const sizeGuidance = beat.shot_size === "wide"
    ? occluded
      ? "tighter wide shot from 2-3 meters away (much closer than usual to keep the main subject identifiable under headwear in multi-person or busy scenes), face at least 25% of frame, the main subject MUST be closest to camera, largest person in frame, most prominent — other characters smaller and further back, scene still readable in the background"
      : "wide environmental shot from 5-7 meters away (photographer standing back), person body under 40% of frame height, face less than 8% of frame, the scene dominates"
    : occluded
      ? "medium-close shot from 2-3 meters away, face at least 25% of frame for clear identity verification under headwear, the main subject closest to camera and largest in frame, environment still readable"
      : "medium shot from 3-4 meters away, person still full-body, face less than 18% of frame, environment still fills most of it";

  const parts = [
    // 开头即放最强 amateur 信号(火山偏好开头指令):本帧场景 + 手机随手拍 + deep focus/no bokeh +
    // NOT a professional photographer + amateur framing cues(tilted/off-center/camera-roll)。
    `casual phone snapshot, NOT professional, NOT a fashion editorial, by a non-photographer friend or as a selfie. THIS photo is one specific moment: ${beat.setting} — ${beat.activity}. (Overall experience: ${safePrompt}.) DEEP FOCUS, NO bokeh, NO portrait mode, NO shallow depth of field. Amateur framing: tilted horizon ok, subject slightly off-center, low-effort camera-roll feel`,
    `same person as the reference selfie`,
    // accessory 前置(位置锁如"centered in front of the waist"必须早出现,火山偏好开头指令)
    `Accessory (same every photo): ${c.accessory}`,
    perspective,
    // OUTFIT 强 enforcement:逐字渲染 + 完整列表(每件都要出现,不要加列表外的物件)。
    // 修了"第一组无帽子/第二组帽子不统一/围裙颜色每帧变"的根因(LLM 写了 outfit 字符串但图模型自由发挥)。
    `Outfit (LITERAL, COMPLETE list — every single item below MUST be visibly worn in this frame, do NOT omit any, do NOT add anything not listed): ${outfit}. If the outfit string contains a hat/cap/toque/helmet/crown/beanie/mask, that headwear MUST be visibly on the subject's head in this frame.`,
    // E3:防莫名加眼镜/帽子/配饰。LLM/图模型在 prompt 长时偶尔自由发挥,显式 ban 高频项。
    `STRICT no-additions enforcement: no eyewear (no glasses, no sunglasses, no goggles, no reading glasses, no monocle) UNLESS explicitly listed in the outfit string above; no hat/headwear UNLESS listed in the outfit above; no additional accessories (no extra bag, no extra watch, no extra necklace, no extra ring, no extra earrings, no extra scarf) beyond the accessory/jewelry/shoes locked above. The locked attire is exhaustive — anything not in the list MUST NOT appear`,
    `Hair (locked): ${c.hairstyle}; jewelry: ${c.jewelry}; shoes: ${c.shoes}`,
    `Camera & color: ${c.camera_style}, ${c.film_look}`,
    sizeGuidance,
    `Expression for THIS frame (do not reuse): ${beat.expression_beat}`,
    "realistic 4:5 phone snapshot, deep focus (everything sharp, NO background bokeh), natural exposure (slightly off auto-HDR ok), visible skin texture, imperfect framing like someone's camera-roll",
    // 平光要求(反 backlit/golden-hour/sunset)+ 反专业构图,整段任意位置命中即可
    "lighting prefers flat midday daylight or overcast cloudy or boring flat light — NO backlit, NO rim light, NO silhouette light, NO golden hour, NO warm sunset, NO sunrise glow",
    "NO studio lighting, NO dramatic cinematic lighting, NO portrait-mode bokeh, NO magazine/editorial composition, NO fashion editorial, NO model pose, NO golden-hour fashion-shoot framing, no text, no watermark, creative imagined scene only",
    // 反"小工具粘在身上"(原 bug:勺子像粘在围裙外)。
    "NO floating disconnected objects — every accessory/tool must be naturally held by a hand or attached to a strap/pocket the way real objects rest; no items pasted on the body surface",
  ];
  if (c.anchor_object) {
    parts.push(`the EXACT same ${c.anchor_object.name} visible — ${c.anchor_object.appearance} — identical across every photo`);
  }
  if (beat.companion) {
    // 用户产品判断:AI 生成虚构人脸不构成肖像权侵犯,该出现的角色就该出现。
    // 旧版"NEVER show face"过严,让情感互动场景退化为空环境。
    // 新版:允许 visible face,但 main subject 仍 foreground,companion 远景/中景,不喧宾夺主。
    // 保留 silhouette/back view/blurred/held hand 作为情感亲密时的可选表达。
    parts.push(`companion present: ${beat.companion} — the main subject (the person matching the reference selfie) MUST remain in the foreground, closest to the camera, largest in frame; the companion appears at MEDIUM DISTANCE or in the background, smaller in frame, with a less-detailed outfit so the main subject stays unambiguous. The companion may have a softly visible face when the scene calls for it (a grateful family, a cheering crowd), OR appear as back view / side silhouette / a held hand / blurred outline when intimacy is the point — identity verification focuses ONLY on the main subject, not the companion`);
  }
  if (beat.face_orientation) {
    // rule 11:每帧角度显式注入,让图模型按方向生成,vlm 按方向判 identity。
    // front/three_quarter: 大部分场景默认,正面或微转。
    // profile: 对峙/侧颜场景,看侧脸 + 身体。
    // back_view: 走远/远眺/亲密时刻,身材 + outfit + 发型为 identity 依据。
    const orientationGuidance: Record<NonNullable<typeof beat.face_orientation>, string> = {
      front: "face orientation: directly facing the camera, front-facing, full face visible",
      three_quarter: "face orientation: three-quarter angle, head slightly turned away from camera (3/4 view), most of face still visible",
      profile: "face orientation: side profile, seen from the side, jawline and cheekbone visible",
      back_view: "face orientation: back view from behind, subject facing away from camera — identity is established by outfit color/silhouette, hair color and length, body proportions and posture, not by facial features. The subject should be clearly identifiable from behind",
    };
    parts.push(orientationGuidance[beat.face_orientation]);
  }
  if (occluded) {
    // 用户产品判断:医生戴 mask/蝙蝠侠戴面具是合理的,不该强迫摘下来。
    // 转向"身体轮廓 + 露出特征"引导:让识别系统看 eyes + 露出皮肤 + 身材,而非全脸。
    // 遮挡件保持自然状态,不要求 "pushed back"/"removed"/"pulled down"。
    parts.push("identity cues for recognition: keep visible features readable (eyes if shown, exposed skin on forehead/jawline/hands if visible, body proportions, posture, hair color/texture peeking out) — the listed headwear/mask/hood/visor stays naturally worn for this scene's real-world context; do NOT remove, push back, or pull down the occluding item just to show more face. A masked surgeon in the OR / a helmeted general in battle / a costumed hero in mask should look authentic, not awkwardly unmasked");
  }
  parts.push("anatomically correct: exactly two hands and two arms, no third arm/hand, no extra limbs, correct fingers");
  // 极端战斗/动作姿势会触发图模型生成扭曲肢体 → vlm 判畸形(realism fail)。
  // 加全局反夸张约束:动作场景仍允许,但姿势必须 anatomically clean。
  parts.push("action poses stay anatomically clean: no exaggerated combat poses, no broken limb angles, no impossible weapon-holding stances, no extreme body contortions or stretches — even mid-fight, the body remains naturally proportioned");
  if (constraints && constraints.era !== "modern") {
    parts.push(`period-accurate ${constraints.era} setting ONLY: absolutely NO modern phone, NO modern handbag, NO sneakers, NO selfie pose, NO modern objects`);
  } else if (constraints && !constraints.allowModernProps) {
    parts.push("formal/professional setting: no casual crossbody bag");
  }
  return parts.join(", ");
}
