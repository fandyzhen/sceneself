import { buildImageRequest } from "@/lib/openrouter/image";

// SceneSelf 出图请求构造（纯逻辑）。
// 现已切到 OpenRouter Gemini image preview（chat-completions 兼容接口）：
//  - prompt 走 user message 的 text part；
//  - 参考图走 user message 的 image_url part；
//  - 组一致性靠 prompt 注入（buildSetPrompt）+ 参考图，不再依赖 Seedream 的 size/watermark 字段。

describe("buildImageRequest (OpenRouter Gemini image preview)", () => {
  it("includes the model and prompt as a user message", () => {
    const req = buildImageRequest("a person near a luxury hotel entrance", {
      model: "google/gemini-3.1-flash-image-preview",
    });
    expect(req.model).toBe("google/gemini-3.1-flash-image-preview");
    const msg = req.messages[0];
    expect(msg.role).toBe("user");
    expect(Array.isArray(msg.content)).toBe(true);
    const parts = msg.content as Array<{ type: string; text?: string }>;
    // prompt 末尾会附加分辨率指引（OPENROUTER_IMAGE_SIZE），使用 toContain 校验原 prompt 仍在
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toContain("a person near a luxury hotel entrance");
  });

  it("passes reference images for subject consistency", () => {
    const req = buildImageRequest("x", {
      inputImages: ["https://cdn.example.com/selfie.jpg"],
    });
    const parts = req.messages[0].content as Array<{
      type: string;
      image_url?: { url: string };
    }>;
    const imageParts = parts.filter(p => p.type === "image_url");
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0].image_url?.url).toBe("https://cdn.example.com/selfie.jpg");
  });

  it("omits image parts when there are no references", () => {
    const req = buildImageRequest("x", {});
    const parts = req.messages[0].content as Array<{ type: string }>;
    expect(parts.every(p => p.type === "text")).toBe(true);
  });

  it("filters out empty reference urls", () => {
    const req = buildImageRequest("x", {
      inputImages: ["", "https://a/b.jpg"],
    });
    const parts = req.messages[0].content as Array<{
      type: string;
      image_url?: { url: string };
    }>;
    const imageParts = parts.filter(p => p.type === "image_url");
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0].image_url?.url).toBe("https://a/b.jpg");
  });

  it("hints image+text modalities so the model emits an image", () => {
    const req = buildImageRequest("x");
    expect(req.modalities).toEqual(["image", "text"]);
  });
});
