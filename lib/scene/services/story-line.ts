// StorylineService:两段式第一步。据 [输入+类型+调性+侧重] 生成 6 个不同场景的 StoryBeat + 套装造型。
// 有 OPENROUTER key → LLM 出 JSON;失败/无 key → fallback 通用多场景骨架。
import { createOpenRouterChat } from "../../openrouter/chat";
import { sceneConfig, hasTextProviderKey } from "../config";
import { STORYLINE_SYSTEM, storylineInstruction } from "../prompts";
import { STORYLINE_TYPES, getTone } from "../../../constants/scene-storylines";
import type { StoryBeat, StorylineType, ShotSize, ShotPerspective, SceneAttire } from "../types";

export interface StorylineInput {
  safePrompt: string;
  storylineType: StorylineType;
  toneId: string;
  focusId: string;
  shotCount: number;
  companion: string | null;
}

export interface StorylineResult {
  attire: SceneAttire;
  beats: StoryBeat[];
}

function parseStoryline(text: string, shotCount: number): StorylineResult | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try {
    const j = JSON.parse(cleaned.slice(s, e + 1)) as { attire?: unknown; beats?: unknown[] };

    // 解析 beats
    if (!Array.isArray(j.beats) || j.beats.length === 0) return null;
    const VALID_FACE_ORIENTATIONS = ["front", "three_quarter", "profile", "back_view"] as const;
    type FaceOrientation = typeof VALID_FACE_ORIENTATIONS[number];
    const beats = j.beats.slice(0, shotCount).map((raw, i) => {
      const b = raw as Record<string, unknown>;
      const rawOrient = typeof b.face_orientation === "string" ? b.face_orientation : undefined;
      const face_orientation: FaceOrientation | undefined =
        rawOrient && (VALID_FACE_ORIENTATIONS as readonly string[]).includes(rawOrient)
          ? (rawOrient as FaceOrientation)
          : undefined;
      return {
        index: i + 1,
        scene_title: String(b.scene_title ?? `scene ${i + 1}`),
        setting: String(b.setting ?? ""),
        activity: String(b.activity ?? ""),
        shot_perspective: (b.shot_perspective === "friend_candid" ? "friend_candid" : "selfie") as ShotPerspective,
        shot_size: (b.shot_size === "wide" ? "wide" : "medium") as ShotSize,
        wardrobe: typeof b.wardrobe === "string" && b.wardrobe ? (b.wardrobe as string) : "main",
        expression_beat: String(b.expression_beat ?? "candid natural"),
        is_highlight: !!b.is_highlight,
        ...(face_orientation ? { face_orientation } : {}),
        ...(typeof b.companion === "string" && b.companion ? { companion: b.companion as string } : {}),
      } satisfies StoryBeat;
    });
    if (beats.length < shotCount) return null;
    if (!beats.some(b => b.is_highlight)) beats[0].is_highlight = true;

    // 解析 attire
    const a = (j.attire && typeof j.attire === "object") ? j.attire as Record<string, unknown> : null;
    const attire: SceneAttire = a
      ? {
          outfit: String(a.outfit ?? "outfit fitting the scene"),
          hairstyle: String(a.hairstyle ?? "natural hair"),
          accessory: String(a.accessory ?? "none"),
        }
      : { outfit: "outfit fitting the scene", hairstyle: "natural hair", accessory: "none" };

    return { attire, beats };
  } catch {
    return null;
  }
}

// 通用 fallback:无 LLM 时也产出"明显不同的场景",按时间/空间铺开。
// 每个节拍带独立的 expression_beat,保证 6 张表情互不相同(避免"6 张一个表情")。
const FALLBACK_BEATS: { title: string; setting: (p: string) => string; activity: string; size: ShotSize; persp: ShotPerspective; expr: string }[] = [
  { title: "抵达/开场", setting: p => `arriving at the scene of "${p}", wide establishing view`, activity: "taking it all in", size: "wide", persp: "friend_candid", expr: "wide-eyed first impression, lips parted in awe" },
  { title: "靠近体验", setting: p => `up close in the heart of "${p}"`, activity: "engaging with the moment", size: "medium", persp: "selfie", expr: "soft natural smile, eyes warm" },
  { title: "细节时刻", setting: p => `a quieter corner during "${p}"`, activity: "a small candid detail", size: "medium", persp: "selfie", expr: "quiet thoughtful look, head turned three-quarter" },
  { title: "高潮瞬间", setting: p => `the standout highlight of "${p}"`, activity: "the peak moment", size: "wide", persp: "friend_candid", expr: "mid-laugh caught candidly, eyes half-closed" },
  { title: "另一面", setting: p => `a different side/angle of "${p}", new location`, activity: "another distinct activity", size: "wide", persp: "selfie", expr: "glancing slightly off to the side, relaxed" },
  { title: "收尾", setting: p => `winding down at the end of "${p}"`, activity: "relaxed closing", size: "medium", persp: "friend_candid", expr: "content sigh, gentle smile looking down" },
];

export function fallbackStoryline(input: StorylineInput): StorylineResult {
  const typeDef = STORYLINE_TYPES.find(s => s.id === input.storylineType) ?? STORYLINE_TYPES.find(s => s.id === "journey")!;
  const isPeriod = typeDef.era !== "modern";

  // 古代/幻想/未来场景强制 friend_candid(不允许自拍);!allowSelfie 同理
  const forceFriendCandid = isPeriod || !typeDef.allowSelfie;

  const n = input.shotCount;
  const beats = Array.from({ length: n }, (_, i) => {
    const t = FALLBACK_BEATS[i % FALLBACK_BEATS.length];
    const cycle = Math.floor(i / FALLBACK_BEATS.length);
    const suffix = i < FALLBACK_BEATS.length ? "" : ` (${cycle + 1})`;
    return {
      index: i + 1,
      scene_title: t.title + suffix,
      setting: t.setting(input.safePrompt) + suffix,
      activity: t.activity,
      shot_perspective: (forceFriendCandid ? "friend_candid" : t.persp) as ShotPerspective,
      shot_size: t.size,
      wardrobe: "main",
      expression_beat: cycle > 0 ? `${t.expr} (take ${cycle + 1})` : t.expr,
      is_highlight: i === 3 % n,
      ...(input.companion ? { companion: `${input.companion} as a back-view silhouette` } : {}),
    } satisfies StoryBeat;
  });

  // 根据类型派生 attire
  const attire: SceneAttire = isPeriod
    ? {
        outfit: `period costume fitting the scene (${typeDef.attireHint}), no modern clothing`,
        hairstyle: "period-appropriate hair",
        accessory: "period-appropriate prop or none",
      }
    : {
        outfit: typeDef.attireHint,
        hairstyle: "natural loose hair",
        accessory: "small modern crossbody bag",
      };

  return { attire, beats };
}

export async function generateStoryline(input: StorylineInput): Promise<StorylineResult> {
  if (!hasTextProviderKey()) return fallbackStoryline(input);
  const typeDef = STORYLINE_TYPES.find(s => s.id === input.storylineType) ?? STORYLINE_TYPES.find(s => s.id === "journey")!;
  const tone = getTone(input.toneId);
  // 用 promptFragment(完整英文执行指令)而非 label(中文短词)注入 LLM,让 Q2 真正影响 beat 设计。
  const focusFragment = typeDef.focusOptions.find(f => f.id === input.focusId)?.promptFragment ?? typeDef.focusOptions[0].promptFragment;
  try {
    const text = await createOpenRouterChat(
      [
        { role: "system", content: STORYLINE_SYSTEM },
        { role: "user", content: storylineInstruction({
          safePrompt: input.safePrompt,
          organizingLogic: typeDef.organizingLogic,
          continuityLock: typeDef.continuityLock,
          toneFragment: tone?.promptFragment ?? "natural candid feeling",
          focusFragment,
          shotCount: input.shotCount,
          companion: input.companion,
          attireHint: typeDef.attireHint,
          era: typeDef.era,
          allowSelfie: typeDef.allowSelfie,
          allowModernProps: typeDef.allowModernProps,
        }) },
      ],
      { temperature: 0.8, max_tokens: 2048, model: sceneConfig.textModel, reasoningEffort: "minimal" },
    );
    return parseStoryline(text, input.shotCount) ?? fallbackStoryline(input);
  } catch {
    return fallbackStoryline(input);
  }
}
