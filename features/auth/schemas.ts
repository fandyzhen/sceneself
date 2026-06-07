import { z } from "zod";

const email = z
  .string({ error: "Please enter email" })
  .trim()
  .min(1, "Please enter email")
  .email("Please enter valid email");

const password = z
  .string({ error: "Please enter password" })
  .min(1, "Please enter password");

export const loginSchema = z.object({
  email,
  password,
});

export const signupSchema = z.object({
  name: z
    .string({ error: "Please enter your name" })
    .trim()
    .min(1, "Please enter your name"),
  email,
  password,
  // 营销邮件订阅（默认不勾选，与账号验证分开 — SPEC 8.3）
  marketingOptIn: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
