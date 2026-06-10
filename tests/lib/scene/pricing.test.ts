import { describe, it, expect } from "vitest";
import {
  creditsForSet,
  refundForUndelivered,
  watermarkFor,
  SHOTS_PER_SET,
  CREDITS_PER_PHOTO,
  UNDELIVERED_REFUND_MULTIPLIER,
} from "@/lib/scene/pricing";

describe("pricing", () => {
  it("一组 6 张 × 50 = 300 积分", () => {
    expect(creditsForSet()).toBe(300);
  });

  it("常量 SHOTS_PER_SET=6, CREDITS_PER_PHOTO=50", () => {
    expect(SHOTS_PER_SET).toBe(6);
    expect(CREDITS_PER_PHOTO).toBe(50);
  });

  // "Double" 承诺:未交付帧按 2× 退还(50/张 × 2 = 100/未交付帧)。
  // 见 blog/sceneself-credits-and-plans 与 i18n result.compensation 文案。
  it("未交付补偿倍数常量 = 2 (兑现 Double 承诺)", () => {
    expect(UNDELIVERED_REFUND_MULTIPLIER).toBe(2);
  });

  it("交付 4 张返还 (6-4)×50×2 = 200 (2× 补偿)", () => {
    expect(refundForUndelivered(4)).toBe(200);
  });

  it("交付 5 张返还 (6-5)×50×2 = 100 (2× 补偿)", () => {
    expect(refundForUndelivered(5)).toBe(100);
  });

  it("交付满 6 张不返还", () => {
    expect(refundForUndelivered(6)).toBe(0);
  });

  it("交付 0 张全额 2× 返还 6×50×2 = 600", () => {
    expect(refundForUndelivered(0)).toBe(600);
  });

  it("交付数超过总数也不会出现负返还", () => {
    expect(refundForUndelivered(7)).toBe(0);
  });

  it("有有效订阅 → 不带水印", () => {
    expect(watermarkFor({ hasSubscription: true })).toBe(false);
  });

  it("无订阅(仅赠送积分) → 带水印", () => {
    expect(watermarkFor({ hasSubscription: false })).toBe(true);
  });
});
