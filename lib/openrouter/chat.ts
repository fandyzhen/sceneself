// OpenRouter 文本 chat completions + 多模态视觉理解。
// 都走 /chat/completions 端点（OpenAI 兼容）。
//  - createOpenRouterChat：纯文本（system + user messages），返回 text。
//  - createOpenRouterVision：多模态（user message 里 text + image_url parts），返回 text。
// 视觉模型 / 文本模型默认都是 google/gemini-3.1-flash-lite-preview（同一模型管两件事，
// 节省切换成本；想分开就分别设 OPENROUTER_TEXT_MODEL / OPENROUTER_VISION_MODEL）。

import {
  openRouterConfig,
  validateOpenRouterConfig,
  getOpenRouterHeaders,
} from './config';
import type {
  OpenRouterChatRequest,
  OpenRouterChatResponse,
  OpenRouterMessage,
  OpenRouterMessageContent,
} from './types';

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
  /** Gemini 3.x Lite 支持 reasoning effort："minimal" 最快、"high" 最准。 */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}

const DEFAULT_CHAT_TIMEOUT_MS = 30_000;
const DEFAULT_VISION_TIMEOUT_MS = 45_000;

function extractText(resp: OpenRouterChatResponse): string {
  const choice = resp.choices?.[0];
  if (!choice) return '';
  const content = choice.message?.content;
  if (typeof content === 'string') return content;
  // 部分模型把回答放在 content[].text；做兜底
  if (Array.isArray(content)) {
    for (const part of content) {
      const maybeText = (part as { type?: string; text?: string }).text;
      if (typeof maybeText === 'string' && maybeText.length > 0) return maybeText;
    }
  }
  return '';
}

async function callChatCompletions(
  req: OpenRouterChatRequest & { reasoning?: { effort: string } },
  timeoutMs: number,
): Promise<string> {
  const response = await fetch(`${openRouterConfig.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: getOpenRouterHeaders(),
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = `status ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      message = body.slice(0, 200) || message;
    }
    throw new Error(`OpenRouter chat error: ${message}`);
  }
  const data = (await response.json()) as OpenRouterChatResponse;
  if (data.error?.message) throw new Error(`OpenRouter chat error: ${data.error.message}`);
  return extractText(data);
}

export async function createOpenRouterChat(
  messages: OpenRouterMessage[],
  options?: ChatOptions,
): Promise<string> {
  validateOpenRouterConfig();
  const req: OpenRouterChatRequest & { reasoning?: { effort: string } } = {
    model: options?.model || openRouterConfig.textModel,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 2048,
  };
  if (options?.reasoningEffort) {
    req.reasoning = { effort: options.reasoningEffort };
  }
  return callChatCompletions(req, options?.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS);
}

export async function createOpenRouterVision(
  prompt: string,
  imageUrls: string[],
  options?: ChatOptions,
): Promise<string> {
  validateOpenRouterConfig();
  const refs = imageUrls.filter(Boolean);
  const content: OpenRouterMessageContent[] = [
    ...refs.map(url => ({ type: 'image_url' as const, image_url: { url } })),
    { type: 'text' as const, text: prompt },
  ];
  const req: OpenRouterChatRequest & { reasoning?: { effort: string } } = {
    model: options?.model || openRouterConfig.visionModel,
    messages: [{ role: 'user', content }],
    temperature: options?.temperature ?? 0.2,
    max_tokens: options?.max_tokens ?? 1024,
  };
  // 质检默认走 minimal reasoning：判断式输出，不需要 thinking，省 5-15s/次
  req.reasoning = { effort: options?.reasoningEffort ?? 'minimal' };
  return callChatCompletions(req, options?.timeoutMs ?? DEFAULT_VISION_TIMEOUT_MS);
}
