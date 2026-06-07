// FaceSwapService（SPEC 11.B）：脸不像的兜底。接口预留,MVP 为 no-op(返回 null)。
// 调用方在拿到 null 时,将该帧标记为 dropped 并触发张数补偿;不向用户展示坏帧。
export interface FaceSwapResult {
  imageUrl: string;
}

export async function swapFace(_targetUrl: string, _selfieUrl: string): Promise<FaceSwapResult | null> {
  // TODO: 接入第三方人脸交换能力(脸贴回 + 修复 + 光影融合)。MVP 不实现,坏帧先丢。
  return null;
}
