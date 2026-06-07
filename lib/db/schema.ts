import { pgTable, text, timestamp, boolean, integer, varchar, index, jsonb, real } from "drizzle-orm/pg-core";
import type { ScenePlan, ShotSpec, IdentityRef } from "../scene/types";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // total available credits for the user
  credits: integer("credits").default(0).notNull(),
  // user role: 'admin' | 'user'
  role: text("role").default("user").notNull(),
  // current subscription plan
  planKey: text("plan_key").default("free"),
  // ban status
  banned: boolean("banned").default(false).notNull(),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Payment records (one-time purchases and subscription renewals)
export const payment = pgTable("payment", {
  id: text("id").primaryKey(),
  provider: varchar("provider", { length: 32 }).default("creem").notNull(),
  providerPaymentId: text("provider_payment_id").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 8 }).default("usd").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(), // 'one_time' | 'subscription'
  planKey: varchar("plan_key", { length: 64 }),
  creditsGranted: integer("credits_granted").default(0).notNull(),
  raw: text("raw"), // store provider payload as JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Active subscriptions
export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),
  provider: varchar("provider", { length: 32 }).default("creem").notNull(),
  providerSubId: text("provider_sub_id").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  planKey: varchar("plan_key", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
  raw: text("raw"), // store provider payload as JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// Credit ledger for auditability
export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: varchar("reason", { length: 64 }).notNull(), // 'subscription_cycle' | 'one_time_pack' | 'adjustment' | 'chat_usage' | ...
  paymentId: text("payment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptionCreditSchedule = pgTable(
  "subscription_credit_schedule",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscription.id, { onDelete: "cascade" })
      .unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planKey: varchar("plan_key", { length: 64 }).notNull(),
    creditsPerGrant: integer("credits_per_grant").notNull(),
    intervalMonths: integer("interval_months").notNull(),
    grantsRemaining: integer("grants_remaining").notNull(),
    totalCreditsRemaining: integer("total_credits_remaining").notNull(),
    nextGrantAt: timestamp("next_grant_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => ({
    nextGrantIdx: index("subscription_credit_schedule_next_grant_idx").on(table.nextGrantAt),
  }),
);

// Password reset tokens
export const passwordResetToken = pgTable("password_reset_token", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Newsletter subscriptions
export const newsletterSubscription = pgTable("newsletter_subscription", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active, unsubscribed
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// ============================================================
// SceneSelf：AI 场景照片集生成（路径 B）。见 SPEC 第 2 节。
// ============================================================

// 一次生成任务（一句话 → 一组照片）
export const generationJob = pgTable(
  "generation_job",
  {
    id: text("id").primaryKey(),
    // 免费首组允许匿名（看到结果前不强制注册），故可空
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    // draft|planning|awaiting_choices|generating|completed|partial|failed
    rawPrompt: text("raw_prompt"),
    // IntentRewriter 产出的安全生成口径；进入审核/编排/出图
    safePrompt: text("safe_prompt"),
    rewriteApplied: boolean("rewrite_applied").notNull().default(false),
    rewriteReason: varchar("rewrite_reason", { length: 40 }).notNull().default("none"),
    moderationStatus: varchar("moderation_status", { length: 16 }).notNull().default("not_checked"),
    // not_checked|allow|flag|deny|error
    moderationReason: text("moderation_reason"),
    scenePlan: jsonb("scene_plan").$type<ScenePlan>(),
    selfieUrl: text("selfie_url"), // 临时，按隐私策略删除
    identityRef: jsonb("identity_ref").$type<IdentityRef>(), // 用完按隐私清理
    shotCount: integer("shot_count").notNull().default(4), // 4 free | 9 paid
    aspectRatio: varchar("aspect_ratio", { length: 8 }).notNull().default("4:5"),
    creditsCost: integer("credits_cost").notNull().default(0),
    tier: varchar("tier", { length: 8 }).notNull().default("free"), // free|paid
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    completedAt: timestamp("completed_at"),
  },
  table => ({
    userIdx: index("generation_job_user_idx").on(table.userId),
  }),
);

// 一组里的单帧
export const generationFrame = pgTable(
  "generation_frame",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => generationJob.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    shotSpec: jsonb("shot_spec").$type<ShotSpec>(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    // pending|generating|passed|swapped|dropped|failed
    imageUrl: text("image_url"),
    identityScore: real("identity_score"),
    qualityScore: real("quality_score"),
    failReason: varchar("fail_reason", { length: 16 }), // identity|realism|null
    candidatesTried: integer("candidates_tried").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    jobIdx: index("generation_frame_job_idx").on(table.jobId),
  }),
);

// ============================================================
// 兑换码系统（Batch D）
// - personal: admin/partner 批量生成,用户一码一用兑换积分
// - 字符集去掉 0/O/1/I/L,大小写不敏感(DB 存大写)
// - 现不实现「仅限新用户」「过期时间」,留 expiresAt 字段
// ============================================================
export const redemptionCode = pgTable(
  "redemption_code",
  {
    code: varchar("code", { length: 12 }).primaryKey(), // 12 位大写,unique
    batchId: text("batch_id").notNull(), // 批次 id
    credits: integer("credits").notNull(), // 此码价值
    channel: text("channel"), // 渠道备注（NULLABLE）
    usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }), // 兑换者 userId
    usedAt: timestamp("used_at"), // 兑换时间
    createdBy: text("created_by").notNull(), // 'admin' 或 partnerId
    expiresAt: timestamp("expires_at"), // 现不实现,留字段
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    batchIdx: index("redemption_code_batch_idx").on(t.batchId),
    usedByIdx: index("redemption_code_used_by_idx").on(t.usedBy),
  }),
);

// 合作伙伴 API key:用于通过 /api/partner/codes 自助批量生成
// 仅在创建时返回 plaintext,DB 只存 sha256 hash
export const partnerApiKey = pgTable("partner_api_key", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(), // 合作伙伴名
  keyHash: text("key_hash").notNull().unique(), // sha256(plaintext)
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(), // 前 8 位识别
  dailyLimit: integer("daily_limit").default(1000).notNull(),
  codesToday: integer("codes_today").default(0).notNull(),
  todayResetsAt: text("today_resets_at").notNull(), // ISO date 'YYYY-MM-DD',每日重置 codesToday
  totalGenerated: integer("total_generated").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  deactivated: boolean("deactivated").default(false).notNull(),
});
