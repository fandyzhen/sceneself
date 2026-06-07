import {
  getSubscriptionPlanTranslationKey,
  normalizeProfileName,
  updateProfileSchema,
} from "@/lib/account-settings";

describe("account settings helpers", () => {
  it("normalizes profile names before saving them", () => {
    expect(normalizeProfileName("  SceneSelf    Builder  ")).toBe("SceneSelf Builder");
  });

  it("rejects names that are too short after trimming", () => {
    const result = updateProfileSchema.safeParse({
      name: " a ",
    });

    expect(result.success).toBe(false);
  });

  it("maps known subscription plans to existing translation keys", () => {
    expect(getSubscriptionPlanTranslationKey("weekly")).toBe("weekly");
    expect(getSubscriptionPlanTranslationKey("monthly")).toBe("monthly");
    expect(getSubscriptionPlanTranslationKey("yearly")).toBe("yearly");
    expect(getSubscriptionPlanTranslationKey()).toBe("free");
  });
});
