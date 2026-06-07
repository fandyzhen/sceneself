// UploadGate（SPEC 5.1）：自拍质量闸。前端做即时提示；这里是服务端兜底校验。
// 不合格 → 提示重传，不创建 job。
import type { UploadGateResult } from "../types";

export interface UploadCheckInput {
  mime?: string;
  fileSize?: number; // bytes
  width?: number;
  height?: number;
}

const MAX_BYTES = 10 * 1024 * 1024;
const MIN_DIM = 300;

export async function checkUpload(input: UploadCheckInput): Promise<UploadGateResult> {
  const issues: string[] = [];
  if (input.mime && !input.mime.startsWith("image/")) issues.push("not_an_image");
  if (input.fileSize && input.fileSize > MAX_BYTES) issues.push("too_large");
  if (input.width && input.height && (input.width < MIN_DIM || input.height < MIN_DIM)) issues.push("too_small");

  return {
    ok: issues.length === 0,
    issues,
    hint: issues.length
      ? "Use a clear, front-facing selfie (no sunglasses / heavy filters), at least 300×300."
      : undefined,
  };
}
