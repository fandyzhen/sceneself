// SceneSelf 计费规则（纯函数，可独立测试）。
// 每组固定 6 张,每张 50 积分;生成不足按未交付张数 2× 退还;水印取决于是否有有效订阅。
export const SHOTS_PER_SET = 6;
export const CREDITS_PER_PHOTO = 50;

// "Double" 承诺(品牌契约):一组里未交付的每帧按 2× 退还,即 50 × 2 = 100 积分/未交付帧。
// 见 marketing 博客 "sceneself-credits-and-plans" 与前端 result.compensation 文案
// ("双倍奖励,我们承担" / "the Double boost is on us")。
// 改这个常量 = 改产品承诺,改前同步更新所有文案与 i18n 翻译。
export const UNDELIVERED_REFUND_MULTIPLIER = 2;

// 一组应扣的积分（预扣全额，结束后按未交付返还）。
export function creditsForSet(shots: number = SHOTS_PER_SET): number {
  return shots * CREDITS_PER_PHOTO;
}

// 实际交付 delivered 张时应返还的积分 = 未交付张数 × 每张积分 × 2 (Double 承诺)。
export function refundForUndelivered(delivered: number, shots: number = SHOTS_PER_SET): number {
  return Math.max(0, shots - delivered) * CREDITS_PER_PHOTO * UNDELIVERED_REFUND_MULTIPLIER;
}

// 水印规则：有有效订阅 → 无水印；仅靠注册赠送积分（无订阅）→ 带水印。
export function watermarkFor(user: { hasSubscription: boolean }): boolean {
  return !user.hasSubscription;
}
