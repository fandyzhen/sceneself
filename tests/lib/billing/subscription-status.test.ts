import { describe, it, expect } from "vitest";
import { isActiveSubscription } from "@/lib/billing/subscription-status";

const now = new Date("2026-06-03T00:00:00Z");
const future = new Date("2026-12-31T00:00:00Z");
const past = new Date("2026-01-01T00:00:00Z");

describe("isActiveSubscription", () => {
  it("active + 周期未到期 → true（有订阅，无水印）", () => {
    expect(isActiveSubscription({ status: "active", currentPeriodEnd: future }, now)).toBe(true);
  });

  it("trialing + 未到期 → true", () => {
    expect(isActiveSubscription({ status: "trialing", currentPeriodEnd: future }, now)).toBe(true);
  });

  it("active 但已过期 → false", () => {
    expect(isActiveSubscription({ status: "active", currentPeriodEnd: past }, now)).toBe(false);
  });

  it("canceled（即便周期未到）→ false", () => {
    expect(isActiveSubscription({ status: "canceled", currentPeriodEnd: future }, now)).toBe(false);
  });

  it("无订阅记录(null) → false", () => {
    expect(isActiveSubscription(null, now)).toBe(false);
  });

  it("active 且 currentPeriodEnd 为 null（手动/永久授予）→ true", () => {
    expect(isActiveSubscription({ status: "active", currentPeriodEnd: null }, now)).toBe(true);
  });
});
