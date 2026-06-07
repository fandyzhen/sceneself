// Translation：把非英文输入翻译为英文，让下游 ScenePlanner / IntentRewriter 保持英文工作。
// SPEC：语言不应成为障碍。Provider：OpenRouter Gemini 3.1 Flash Lite；失败 fall back 原文。
import { createOpenRouterChat } from "../../openrouter/chat";
import { hasTextProviderKey, sceneConfig } from "../config";

export type DetectedLanguage = "en" | "zh" | "ja" | "ko" | "other";

// Unicode 区段：CJK / 平假名 / 片假名 / Hangul
const RE_CHINESE = /[一-鿿㐀-䶿]/;
const RE_HIRAGANA_KATAKANA = /[぀-ヿ]/;
const RE_HANGUL = /[가-힯ᄀ-ᇿ]/;

export function detectLanguage(text: string): DetectedLanguage {
  if (!text) return "en";
  // 顺序很重要：日文常包含汉字（CJK），先检测假名再回退到中文。
  if (RE_HIRAGANA_KATAKANA.test(text)) return "ja";
  if (RE_HANGUL.test(text)) return "ko";
  if (RE_CHINESE.test(text)) return "zh";
  return "en";
}

const TRANSLATION_SYSTEM = `You translate short user scene descriptions into natural English. Rules:
- Preserve the user's intent, emotion, and any concrete objects (helicopter, Ferrari, dog, watch, etc.).
- Keep it short and direct — one to two sentences max.
- Reply with the translation ONLY. No quotes, no preamble, no commentary.`;

function stripWrappingQuotes(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === "「" && last === "」")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export async function translateToEnglish(text: string): Promise<string> {
  if (!hasTextProviderKey()) return text;
  try {
    const reply = await createOpenRouterChat(
      [
        { role: "system", content: TRANSLATION_SYSTEM },
        { role: "user", content: text },
      ],
      { temperature: 0.2, max_tokens: 256, model: sceneConfig.textModel, reasoningEffort: "minimal" },
    );
    const cleaned = stripWrappingQuotes(reply);
    if (!cleaned) return text;
    return cleaned;
  } catch {
    return text;
  }
}

export interface NormalizedPrompt {
  /** Prompt 实际用于 IntentRewriter / ScenePlanner 的英文文本 */
  workingPrompt: string;
  /** 用户输入的原始语言（前端可据此显示"已自动翻译"） */
  originalLanguage: DetectedLanguage;
  /** 是否真正发生了翻译（LLM 调用成功且返回非空） */
  wasTranslated: boolean;
}

export async function normalizePromptForPlanning(rawPrompt: string): Promise<NormalizedPrompt> {
  const originalLanguage = detectLanguage(rawPrompt);
  if (originalLanguage === "en") {
    return { workingPrompt: rawPrompt, originalLanguage, wasTranslated: false };
  }
  const translated = await translateToEnglish(rawPrompt);
  const wasTranslated = translated !== rawPrompt;
  return { workingPrompt: translated, originalLanguage, wasTranslated };
}
