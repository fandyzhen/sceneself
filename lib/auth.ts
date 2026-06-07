import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { db } from "./db";
import { refundCredits } from "./credits";
import { getGoogleAuthProvider } from "./auth/google-auth";
import { sendEmail } from "./email";

const defaultTrustedOrigins = ["http://localhost:3000"];

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : defaultTrustedOrigins;

const googleAuthProvider = getGoogleAuthProvider();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    // 注册后不强制邮箱验证才能登录（SPEC 8.2：保存/导出场景集时再校验 emailVerified）
    requireEmailVerification: false,
  },
  // Better Auth 内置的邮箱验证发件（24h token）。
  // 自定义 /api/auth/resend-verification 端点仍保留作为前端"重新发送"入口。
  emailVerification: {
    sendOnSignUp: false, // signup-form 内部触发，避免重复
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 小时
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await sendEmail({
          to: user.email,
          subject: "Verify your email - SceneSelf",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">Welcome to SceneSelf!</h1>
              <p>Please click the link below to verify your email address:</p>
              <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                Verify Email
              </a>
              <p>Or copy this link to your browser:</p>
              <p style="color: #666; word-break: break-all;">${url}</p>
              <p style="color: #999; font-size: 14px; margin-top: 30px;">
                This link expires in 24 hours. If you didn't sign up for SceneSelf, you can safely ignore this email.
              </p>
            </div>
          `,
        });
      } catch (error) {
        console.error("[Auth] Failed to send verification email:", error);
      }
    },
  },
  ...(googleAuthProvider
    ? {
        socialProviders: {
          google: googleAuthProvider,
        },
      }
    : {}),

  trustedOrigins,

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Listen for user registration events (email and OAuth)
      if (ctx.path.startsWith("/sign-up")) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          try {
            // Grant 300 credits as registration bonus
            await refundCredits(
              newSession.user.id,
              300,
              "registration_bonus"
            );
            console.log(`[Auth] New user registered, granted 300 credits: ${newSession.user.email}`);
          } catch (error) {
            console.error("[Auth] Failed to grant registration bonus:", error);
          }
        }
      }
    }),
  },
});

export { hashPassword } from "better-auth/crypto";
