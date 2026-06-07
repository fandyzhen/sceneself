// 用 OpenRouter (Gemini image preview) 出图。
// 接口形态：OpenAI 兼容 /chat/completions；提示词 + 可选参考图作为 user message 内容，
// 响应里的图像放在 choices[0].message.images[].image_url.url（base64 data URL）。
//
// 重试：和 Seedream 一致，5xx / 429 / timeout 重试 1 次。
// 超时：单次 180s（Gemini image preview 偶尔 30-60s）。

import {
  openRouterConfig,
  validateOpenRouterConfig,
  getOpenRouterHeaders,
} from './config';
import type {
  OpenRouterChatRequest,
  OpenRouterChatResponse,
  OpenRouterMessageContent,
  OpenRouterImagePart,
} from './types';

export interface OpenRouterImageOptions {
  inputImages?: string[]; // 参考图（http(s) URL 或 base64 data URL）
  model?: string;          // 覆盖默认模型
  timeoutMs?: number;
}

// 激进加速：Gemini 3.1 Flash Image 实测 30-60s/张，>90s 基本是 stuck。
// 切短让 maxCandidatesPerFrame 兜底重抽，比内置重试 + 长 timeout 更稳。
const DEFAULT_TIMEOUT_MS = 90_000;

export function buildImageRequest(prompt: string, opts?: OpenRouterImageOptions): OpenRouterChatRequest {
  // 把分辨率/画幅指引拼到 prompt 末尾。Gemini image preview 没有原生 size 字段，
  // 通过 prompt 提示模型输出目标分辨率（不绝对，但比不写好）。
  const sizeHint = openRouterConfig.imageSizeHint;
  const fullPrompt = sizeHint
    ? `${prompt}\n\nOutput format: ${sizeHint}.`
    : prompt;
  const content: OpenRouterMessageContent[] = [{ type: 'text', text: fullPrompt }];
  const refs = opts?.inputImages?.filter(Boolean) ?? [];
  for (const url of refs) {
    content.push({ type: 'image_url', image_url: { url } });
  }
  return {
    model: opts?.model || openRouterConfig.imageModel,
    messages: [{ role: 'user', content }],
    // 提示 OpenRouter / 模型走图像输出
    modalities: ['image', 'text'],
  };
}

function extractImageUrl(resp: OpenRouterChatResponse): string | null {
  const choice = resp.choices?.[0];
  if (!choice) return null;
  const msg = choice.message;

  // 1) 标准：message.images[]
  if (Array.isArray(msg.images)) {
    for (const img of msg.images as OpenRouterImagePart[]) {
      const url = img?.image_url?.url;
      if (url) return url;
    }
  }
  // 2) 退路：message.content 数组里带 image_url
  if (Array.isArray(msg.content)) {
    for (const part of msg.content as OpenRouterImagePart[]) {
      if (part?.type === 'image_url' && part.image_url?.url) return part.image_url.url;
    }
  }
  return null;
}

async function callOpenRouterImageOnce(
  req: OpenRouterChatRequest,
  timeoutMs: number,
): Promise<string> {
  const response = await fetch(`${openRouterConfig.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: getOpenRouterHeaders(),
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.error(
      `[OpenRouterImage] non-2xx ${response.status} model=${req.model} body=${bodyText.slice(0, 500)}`,
    );
    let message = `status ${response.status}`;
    try {
      const parsed = JSON.parse(bodyText) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      message = bodyText.slice(0, 200) || message;
    }
    const err = new Error(`OpenRouter image error: ${message}`);
    if (response.status >= 500 || response.status === 429) {
      (err as Error & { retryable?: boolean }).retryable = true;
    }
    throw err;
  }

  const data = (await response.json()) as OpenRouterChatResponse;
  if (data.error?.message) throw new Error(`OpenRouter image error: ${data.error.message}`);
  const url = extractImageUrl(data);
  if (!url) {
    console.error('[OpenRouterImage] no image in response', JSON.stringify(data).slice(0, 600));
    throw new Error('OpenRouter returned no image');
  }
  return url;
}

/**
 * 调用 OpenRouter Gemini image preview 出一张图。
 * 返回值通常是 base64 data URL（`data:image/png;base64,...`），调用方自行决定是否
 * 上传到对象存储或直接下发给前端。
 */
export async function generateOpenRouterImage(
  prompt: string,
  options?: OpenRouterImageOptions,
): Promise<string> {
  validateOpenRouterConfig();
  const req = buildImageRequest(prompt, options);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // 不做内置重试 —— SceneSelf orchestrator 的 maxCandidatesPerFrame 已经提供「质检不过 → 再抽一次」
  // 的兜底，这里再重试一次会让单帧最坏耗时翻倍（=2 × timeout），挤占 Vercel 300s 预算。
  return await callOpenRouterImageOnce(req, timeoutMs);
}

// 兼容旧 Volcano `generateImage` 返回结构的薄包装：route.ts 可直接套用。
export interface OpenRouterImageResultLike {
  data: Array<{ url: string; revised_prompt?: string }>;
}

export async function generateImageLikeVolcano(
  prompt: string,
  options?: { size?: string; inputImages?: string[]; watermark?: boolean },
): Promise<OpenRouterImageResultLike> {
  void options?.size; // Gemini 不支持 size 档位，由 prompt 描述构图
  void options?.watermark; // Gemini 不支持 watermark 开关
  const url = await generateOpenRouterImage(prompt, { inputImages: options?.inputImages });
  return { data: [{ url }] };
}
