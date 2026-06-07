import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { uploadToR2, isR2Configured } from "@/lib/r2-storage";
import { getActiveSessionUser } from "@/lib/auth/session";
import { getErrorMessage } from "@/lib/error-utils";
import { isHeic, heicToJpeg } from "@/lib/image/heic";
import { checkFace } from "@/lib/scene/services";

// 自拍上传：允许匿名（前置体验，到生成才强制登录）。
const MAX_BYTES = 12 * 1024 * 1024; // 12MB，容纳手机高清自拍 / HEIC

// 火山 Seedream 仅认 JPEG/PNG/WebP 作为参考图（实测 AVIF 返回 UnsupportedImageFormat）。
// HEIC 走 heic-convert 转 JPEG；其余非 JPEG/PNG 用 sharp 一律转 JPEG，确保下游可用。
const VOLCANO_NATIVE_CONTENT_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    // 放宽类型门：iOS/安卓上传 HEIC 时 file.type 可能为空或 octet-stream，按扩展名/魔数兜底。
    const type = file.type || "";
    const name = file.name || "";
    const looksImage =
      type.startsWith("image/") ||
      /\.(heic|heif|jpe?g|png|webp)$/i.test(name) ||
      type === "application/octet-stream";
    if (!looksImage) {
      return NextResponse.json({ error: "请上传一张照片（JPG / PNG / HEIC）。" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "图片超过 12MB，请换一张。" }, { status: 400 });
    }

    const access = await getActiveSessionUser(req.headers);
    const owner = access.ok ? access.user.id : "anon";

    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    let contentType = type.startsWith("image/") ? type : "image/jpeg";

    // HEIC / Live Photo 静帧 → JPEG（火山出图 API 不认 HEIC）。
    if (isHeic(buffer)) {
      buffer = await heicToJpeg(buffer);
      contentType = "image/jpeg";
    } else if (!VOLCANO_NATIVE_CONTENT_TYPES.has(contentType.toLowerCase())) {
      // AVIF / GIF / 其他非 JPEG/PNG/WebP → sharp 转 JPEG（火山只认这几种）。
      // 实测 AVIF 提交给火山会返回 InvalidParameter.UnsupportedImageFormat。
      try {
        buffer = await sharp(buffer).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
        contentType = "image/jpeg";
      } catch (transcodeError) {
        console.error("[Upload] sharp transcode failed:", transcodeError);
        return NextResponse.json(
          { error: "无法识别该图片格式，请上传 JPG / PNG / HEIC 照片。" },
          { status: 400 },
        );
      }
    }

    if (isR2Configured()) {
      const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
      const key = `selfies/${owner}/${randomUUID()}.${ext}`;
      const url = await uploadToR2(key, buffer, contentType);
      // 人脸检测闸：vision LLM 校验"清晰单人人脸自拍"，不通过提示重传。
      const faceCheck = await checkFace(url);
      if (!faceCheck.ok) {
        return NextResponse.json({ ok: false, faceIssue: faceCheck.reason });
      }
      return NextResponse.json({ url });
    }

    // dev fallback：无 R2 时回 data URL，让前端流程可演示。
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    // 人脸检测闸（dev fallback 同样过一遍）。
    const faceCheck = await checkFace(dataUrl);
    if (!faceCheck.ok) {
      return NextResponse.json({ ok: false, faceIssue: faceCheck.reason });
    }
    return NextResponse.json({ url: dataUrl });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, "Upload failed") }, { status: 500 });
  }
}
