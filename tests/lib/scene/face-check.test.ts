import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/scene/config", () => ({
  sceneConfig: { visionModel: "v" },
  hasVisionProviderKey: () => true,
}));

const visionMock = vi.fn();
vi.mock("@/lib/openrouter/chat", () => ({
  createOpenRouterVision: (...a: unknown[]) => visionMock(...a),
}));

import { checkFace } from "@/lib/scene/services/face-check";

describe("checkFace 人脸检测闸", () => {
  beforeEach(() => visionMock.mockReset());

  it("无脸（狗/风景） → ok=false no_face", async () => {
    visionMock.mockResolvedValue('{"has_clear_face":false,"single_person":false}');
    expect(await checkFace("u")).toEqual({ ok: false, reason: "no_face" });
  });

  it("清晰单人 → ok=true", async () => {
    visionMock.mockResolvedValue('{"has_clear_face":true,"single_person":true}');
    expect(await checkFace("u")).toEqual({ ok: true });
  });

  it("多人 → ok=false multiple_people", async () => {
    visionMock.mockResolvedValue('{"has_clear_face":true,"single_person":false}');
    expect(await checkFace("u")).toEqual({ ok: false, reason: "multiple_people" });
  });

  it("解析失败 → 保守放行 ok=true", async () => {
    visionMock.mockResolvedValue("no json here");
    expect(await checkFace("u")).toEqual({ ok: true });
  });
});
