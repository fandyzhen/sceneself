// OpenRouter 调用配置。覆盖 SceneSelf 三类模型：
//  - 图像生成（imageModel）: 默认 google/gemini-3.1-flash-image-preview (Nano Banana 2)
//  - 多模态视觉（visionModel）: 用于质检 / 组一致性 / 身份粗判
//  - 文本（textModel）: 用于场景规划 / 翻译 / 消歧问答
// 默认 textModel == visionModel == gemini-3.1-flash-lite-preview（同一模型多模态,管理最简单）。
// 走 OpenAI 兼容的 /chat/completions 端点；图像模型把生成结果放在
// `choices[0].message.images[].image_url.url`（base64 data URL）。

export interface OpenRouterConfig {
  apiKey: string;
  apiUrl: string;
  imageModel: string;
  textModel: string;
  visionModel: string;
  /** 出图 prompt 中追加的分辨率指引，例如 "1024px portrait 4:5" */
  imageSizeHint: string;
  // 可选：OpenRouter 推荐携带 HTTP-Referer / X-Title 让用量可归因
  appReferer?: string;
  appTitle?: string;
}

export const openRouterConfig: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY || '',
  apiUrl: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1',
  imageModel: process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview',
  textModel: process.env.OPENROUTER_TEXT_MODEL || 'google/gemini-3.1-flash-lite-preview',
  visionModel: process.env.OPENROUTER_VISION_MODEL || 'google/gemini-3.1-flash-lite-preview',
  imageSizeHint: process.env.OPENROUTER_IMAGE_SIZE || '1024px portrait 4:5',
  appReferer: process.env.NEXT_PUBLIC_APP_URL || undefined,
  appTitle: 'SceneSelf',
};

export function validateOpenRouterConfig(): void {
  if (!openRouterConfig.apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }
  if (!openRouterConfig.apiUrl) {
    throw new Error('OPENROUTER_API_URL is not configured');
  }
}

export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export function getOpenRouterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${openRouterConfig.apiKey}`,
  };
  if (openRouterConfig.appReferer) headers['HTTP-Referer'] = openRouterConfig.appReferer;
  if (openRouterConfig.appTitle) headers['X-Title'] = openRouterConfig.appTitle;
  return headers;
}
