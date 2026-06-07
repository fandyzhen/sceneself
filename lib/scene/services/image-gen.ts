// ImageGenService（SPEC 5.4）：出图。
// 历史上走火山 Seedream（doubao-seedream-*），现已切到 OpenRouter Gemini image preview。
// 无 OPENROUTER_API_KEY → 返回 4:5 占位图，让前端流程可演示；key 到位即真实出图。
//
// 设计取舍：Gemini image preview 不支持 Seedream 的 sequential_image_generation 批量出图，
// 所以 generateSceneSet 退化为「按 shot 并行单图调用 + 注入 set-level continuity prompt」。
// buildSetPrompt 仍然是 model-agnostic 的纯函数（多个测试依赖），保持不动。

import { generateOpenRouterImage } from "../../openrouter/image";
import { shouldUseImageFallback } from "../config";
import type { ScenePlan, ShotSpec } from "../types";

export interface SceneImageResult {
  index: number;
  imageUrl: string;
}

export interface GenerateOptions {
  // Gemini image preview 无原生 watermark 开关；保留入参以维持调用方签名兼容。
  watermark?: boolean;
  seed?: string; // dev 占位图稳定用
}

function placeholderUrl(seed: string, index: number): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}-${index}/1080/1350`;
}

// 单帧出图（补救时也用）。
export async function generateSceneImage(
  shot: ShotSpec,
  referenceImages: string[],
  opts?: GenerateOptions,
): Promise<SceneImageResult> {
  if (shouldUseImageFallback()) {
    return { index: shot.index, imageUrl: placeholderUrl(opts?.seed ?? "scene", shot.index) };
  }
  const refs = referenceImages.filter(Boolean);
  const url = await generateOpenRouterImage(shot.image_prompt, {
    inputImages: refs,
  });
  return { index: shot.index, imageUrl: url };
}

// 整组逐帧并行出图。
export async function generateSceneImages(
  shots: ShotSpec[],
  referenceImages: string[],
  opts?: GenerateOptions,
): Promise<SceneImageResult[]> {
  return Promise.all(shots.map(shot => generateSceneImage(shot, referenceImages, opts)));
}

// ── 组图 prompt（model-agnostic：把 set-level continuity 编码进 prompt）──

// 从 scene_plan 合成整组 prompt：统一 continuity + 各帧叙事节拍 + 可选 anchor_object 锁定。
// 该函数纯逻辑、与具体出图模型无关；用作 Seedream 时是一条整组 prompt，
// 用作 Gemini 时也可拼到每帧 prompt 前面强化一致性。
export function buildSetPrompt(plan: ScenePlan): string {
  const c = plan.continuity;
  // 每帧叙事 + 表情 beat（独立微表情，避免 6 张一个表情）
  const beats = plan.shots
    .map((s, i) => `${i + 1}) ${s.summary} — facial expression: ${s.expression_beat ?? "candid natural"}`)
    .join("; ");
  const lines = [
    `Generate ${plan.shots.length} cohesive candid photos of the SAME person as the reference selfie, forming one photo set titled "${plan.title}".`,
    // 显式锁定 5 大穿戴元素，每项必须 verbatim 在每帧出现（颜色 / 材质 / 哪一侧）
    `Identical-across-every-photo elements (do NOT change between photos): outfit = ${c.outfit}; hair = ${c.hairstyle}; jewelry = ${c.jewelry}; shoes = ${c.shoes}; accessory = ${c.accessory} — exact same color, material and worn-side every time.`,
    `Camera & color treatment: ${c.camera_style}, ${c.film_look}.`,
  ];
  if (c.anchor_object) {
    lines.push(
      `The same ${c.anchor_object.name} must appear identical in every photo of the set: ${c.anchor_object.appearance}. Do not change its color, model, or markings between photos.`,
    );
  }
  lines.push(
    `The photos, in order: ${beats}.`,
    // 表情区分要求
    `Each photo MUST have a DISTINCT micro-expression as listed above — never the exact same face twice across the set; only outfit and hair stay identical.`,
    // wide-dominant + 量化 face 占比
    `Shot composition: prefer WIDE environmental shots where the face occupies less than 12% of the frame and the surrounding scene fills the photo. Avoid tight close-ups. The person should look part of the environment, not pasted on top.`,
    // 强 negative 防止 LLM 自由加饰品 / 改发型 / 改 outfit 覆盖度 / 改 accessory 位置
    `Strict rule: NO additional jewelry beyond the jewelry listed above (do NOT add necklaces, bracelets, rings, or earrings not on the list). NO accessories not listed. If hair is listed as tied, hair stays tied in EVERY photo (never loose). NO outfit changes between photos: if the outfit description says "full midriff coverage" or "covers the midriff", the midriff stays covered in EVERY photo (no exposed midriff, no exposed belly, no crop top variation). The accessory position never changes — if the accessory description specifies a worn-side or front/back position, the accessory stays in the exact same spot in EVERY photo (same worn-side, never moves between front, back, left, or right).`,
    // 手机随手拍风格
    `Each photo MUST look like a real phone snapshot: 4:5 portrait, deep focus (everything sharp, NO background bokeh), shot on a phone by a friend or as a selfie — NOT by a professional photographer. Imperfect framing (tilted horizon ok, subject not always centered), natural / slightly off auto-HDR exposure, visible skin texture (pores, slight shine, minor redness — NOT airbrushed), occasional mild handheld motion blur or lens flare ok. NO studio lighting, NO ring light, NO magazine-cover composition, NO ad-campaign symmetry, NO golden-hour fashion-shoot framing. No text, no watermark, creative imagined scene only.`,
  );
  return lines.join(" ");
}

// 组图模式：Gemini image preview 不支持一次出 N 图（Seedream 的 sequential_image_generation 专属能力）。
// 退化为并行单图调用，但仍可用 buildSetPrompt 加在每帧 prompt 前面强化组一致性。
export async function generateSceneSet(
  plan: ScenePlan,
  referenceImages: string[],
  opts?: GenerateOptions,
): Promise<SceneImageResult[]> {
  if (shouldUseImageFallback()) {
    return plan.shots.map(s => ({ index: s.index, imageUrl: placeholderUrl(opts?.seed ?? "scene", s.index) }));
  }
  const setPrefix = buildSetPrompt(plan);
  const refs = referenceImages.filter(Boolean);
  const results = await Promise.all(
    plan.shots.map(async shot => {
      const fullPrompt = `${setPrefix}\n\nFocus on photo #${shot.index + 1}: ${shot.image_prompt}`;
      const url = await generateOpenRouterImage(fullPrompt, { inputImages: refs });
      return { index: shot.index, imageUrl: url };
    }),
  );
  return results.filter(r => r.imageUrl);
}
