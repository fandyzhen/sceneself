// SceneCaption：把【已经丰富的 6 个场景】各提炼成 1 句「爆款短视频钩子」文案。
// 注意边界：caption 是给【用户看】的展示文字（弹幕 + 结果页图片下方），不参与出图。
// 出图永远用 beat 的丰富 image_prompt；caption 只是对场景的精炼概括，不是场景本身。
//
// 规则（对标产品参考文档 md）：
//  - 跟随用户输入语言（中→中、英→英、其它→对应语种）
//  - 去掉第一人称（无「我 / I」）：主角默认就是用户本人，省略主语
//  - 短而有钩子：中文 ≤14 字（硬上限 20）、其它语言一行 ~6-10 词
//  - 不要「地点·时间」公式、不要「·」分隔，一句自然口语
//  - 严格基于该场景（用真实 setting/action/emotion），不凭空
//  - 整组 6 句同一种 tone 语感，连起来是一个完整故事
import { createOpenRouterChat } from "../../openrouter/chat";
import { hasTextProviderKey, sceneConfig } from "../config";
import type { StoryBeat } from "../types";

// 8 种 tone 的「文案画面语感」——与 constants/scene-storylines.ts 的 SCENE_TONES 一一对应，
// 描述取自产品参考文档（8 种短视频画面风格）。
const TONE_CAPTION_VOICE: Record<string, string> = {
  narrative_doc: "纪实真实 vlog 感：原生实拍、生活化、接地气，像随手记录的真实日常",
  surprise_highlight: "惊喜高光：意外、情绪炸裂、记忆点拉满，抓拍最难忘的那一瞬",
  healing_chill: "治愈松弛：柔光慢镜、暖调、慵懒解压，温柔舒缓",
  cinematic_drama: "电影感：光影构图、逆光氛围、叙事张力，像电影定格画面",
  versailles_flex: "低调高级：极简克制、精致质感、含蓄不张扬的高级感",
  funny_meme: "搞怪玩梗：活泼俏皮、趣味反差、轻松可爱，自带笑点",
  romantic: "浪漫梦幻：柔焦唯美、温柔诗意、氛围感拉满",
  epic_blood: "史诗热血：广角大景、动态气场、燃向炸裂，热血感拉满",
};

const CAPTION_SYSTEM = `You are a top short-video copywriter (抖音 / 小红书 / Reels viral hooks). You are given 6 vivid scenes from ONE story plus a target visual STYLE. For EACH scene, write ONE short, scroll-stopping caption — like the first 3 seconds of a viral clip that freezes on the most memorable, on-style instant of that scene.

HARD RULES:
- Write in the SAME language as the REFERENCE text (Chinese→Chinese, English→English, Japanese→Japanese, Korean→Korean, Spanish→Spanish, etc.).
- OMIT the first-person pronoun — NO 我, NO "I", NO "my". The subject is always the user themselves, so it is understood; start each caption with the action / image, never with a pronoun.
- Keep each caption SHORT and punchy: Chinese aim ≤ 14 characters (hard max 20); other languages one short line (~6-10 words). NO "location · time" formula, NO " · " separator, NO robotic "<action> · <place>". One natural, vivid spoken line.
- Each caption is a CONDENSED HOOK of its OWN scene — use that scene's real setting / action / emotion, never invent anything not in the scene, and do NOT just copy the scene description verbatim. Tease, don't list.
- NO FALSIFIABLE VISUAL CLAIMS: do NOT state a specific COLOR (red / green / neon / gold…), a specific car/product MODEL or brand, a plate/tail number, or an exact COUNT of objects. You CANNOT see the final image, and the scene text may not match what gets rendered — naming a concrete color or model risks describing something that is NOT in the photo (this is a real reported bug). Describe the action, mood, vibe and energy instead of pinning down a color/model/number. (General atmosphere words like "金色黄昏/dusk", "夜色" tied to the scene's stated lighting are fine; a specific object's paint color is NOT.)
- ALL 6 captions share the target STYLE's voice and read as ONE coherent story in order.
- Make it emotional and attractive (a reason to stop scrolling), not a dry summary.

Reply STRICT JSON only, no markdown: {"captions":["...","...","...","...","...","..."]} with EXACTLY 6 items in scene order.`;

/**
 * 把 6 个丰富场景提炼成 6 句爆款 caption（用户语言、按 tone 语感）。
 * @param beats    storyline 生成的 6 个 StoryBeat（含 setting/activity/expression/is_highlight）
 * @param toneId   用户在问答页选的 tone id（SCENE_TONES 之一）
 * @param rawPrompt 用户原始输入（决定输出语言）
 * 无 key / 失败 / 数量不符 → 回退每个 beat 的 scene_title。
 */
export async function writeSceneCaptions(
  beats: StoryBeat[],
  toneId: string,
  rawPrompt: string,
): Promise<string[]> {
  const fallback = beats.map(b => (b.scene_title || b.setting || "").trim());
  if (beats.length === 0) return [];
  if (!hasTextProviderKey()) return fallback;
  try {
    const voice = TONE_CAPTION_VOICE[toneId] ?? "natural, vivid, attractive viral short-video voice";
    const scenes = beats
      .map((b, i) =>
        `Scene ${i + 1}${b.is_highlight ? " (the climax / cover)" : ""}: setting=${b.setting}; action=${b.activity}; expression=${b.expression_beat ?? ""}`,
      )
      .join("\n");
    const user = `Target STYLE voice (every caption must feel like this): ${voice}
REFERENCE text — write ALL captions in THIS language (these are the user's own words): "${rawPrompt}"
The 6 scenes (already designed in detail; condense EACH into ONE hook, keep order):
${scenes}`;
    const reply = await createOpenRouterChat(
      [
        { role: "system", content: CAPTION_SYSTEM },
        { role: "user", content: user },
      ],
      { temperature: 0.85, max_tokens: 700, model: sceneConfig.textModel, reasoningEffort: "minimal" },
    );
    const cleaned = (reply ?? "").replace(/```json/gi, "").replace(/```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s === -1 || e <= s) return fallback;
    const parsed = JSON.parse(cleaned.slice(s, e + 1)) as { captions?: unknown };
    const caps = parsed.captions;
    if (!Array.isArray(caps) || caps.length !== beats.length) return fallback;
    return caps.map((c, i) => (typeof c === "string" && c.trim() ? c.trim() : fallback[i]));
  } catch {
    return fallback;
  }
}
