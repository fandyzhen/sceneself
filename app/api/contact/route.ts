// /api/contact — Contact form submission endpoint.
// 表单内容通过 Resend 发到 support@sceneself.com，replyTo 设为用户邮箱方便回复。
// 失败时返回 4xx/5xx，前端展示错误；成功时返回 200。

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { contactSchema } from "@/features/marketing/schemas";

const TO_EMAIL = process.env.CONTACT_TO_EMAIL ?? "support@sceneself.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues.map(i => i.message) },
      { status: 400 },
    );
  }

  const { name, email, message } = parsed.data;

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#0c0a09;margin-bottom:16px;">New contact form submission</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 12px;background:#fafaf9;border:1px solid #e7e5e4;font-weight:600;width:100px;">Name</td><td style="padding:8px 12px;border:1px solid #e7e5e4;">${safeName}</td></tr>
        <tr><td style="padding:8px 12px;background:#fafaf9;border:1px solid #e7e5e4;font-weight:600;">Email</td><td style="padding:8px 12px;border:1px solid #e7e5e4;"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
      </table>
      <h3 style="color:#0c0a09;margin-top:24px;">Message</h3>
      <div style="padding:16px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;line-height:1.6;">${safeMessage}</div>
      <p style="margin-top:24px;color:#78716c;font-size:13px;">Reply directly to this email to respond to the user.</p>
    </div>
  `;

  const text = `New contact form submission\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\n--\nReply directly to this email to respond.`;

  const result = await sendEmail({
    to: TO_EMAIL,
    subject: `[Contact] ${name} — SceneSelf`,
    html,
    text,
    replyTo: email,
  });

  if (!result.success) {
    console.error("[Contact] sendEmail failed", result.error);
    return NextResponse.json(
      { error: "Email service unavailable. Please email us directly at support@sceneself.com." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
