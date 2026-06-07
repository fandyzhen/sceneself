// OpenRouter chat-completions 接口的最小类型（够覆盖 Gemini image preview）。

export interface OpenRouterMessageContentText {
  type: 'text';
  text: string;
}

export interface OpenRouterMessageContentImage {
  type: 'image_url';
  image_url: { url: string };
}

export type OpenRouterMessageContent =
  | OpenRouterMessageContentText
  | OpenRouterMessageContentImage;

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenRouterMessageContent[];
}

export interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterMessage[];
  modalities?: Array<'text' | 'image'>;
  temperature?: number;
  max_tokens?: number;
}

export interface OpenRouterImagePart {
  type: string;
  image_url?: { url: string };
}

// 响应里 Gemini 把生成图片塞在 message.images[]（最常见），
// 也可能塞在 message.content 数组里 type='image_url' 的对象。两种都兼容。
export interface OpenRouterChatChoice {
  index: number;
  message: {
    role: string;
    content: string | OpenRouterImagePart[] | null;
    images?: OpenRouterImagePart[];
  };
  finish_reason?: string | null;
}

export interface OpenRouterChatResponse {
  id?: string;
  object?: string;
  model?: string;
  choices: OpenRouterChatChoice[];
  error?: { message?: string; code?: number };
}

export interface OpenRouterErrorBody {
  error?: { message?: string; code?: number };
}
