import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// R2 Configuration
const STORAGE_ACCESS_KEY_ID = process.env.STORAGE_ACCESS_KEY_ID || '';
const STORAGE_SECRET_ACCESS_KEY = process.env.STORAGE_SECRET_ACCESS_KEY || '';
const STORAGE_PUBLIC_URL = process.env.STORAGE_PUBLIC_URL || '';
const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT || '';
const STORAGE_BUCKET_NAME = process.env.STORAGE_BUCKET_NAME || 'starter';

// Extract endpoint URL from the full endpoint if needed
const getEndpointUrl = () => {
  if (STORAGE_ENDPOINT.includes('.r2.cloudflarestorage.com')) {
    // Extract just the endpoint URL without bucket
    const parts = STORAGE_ENDPOINT.split('/');
    return parts[0] + '//' + parts[2]; // https://xxx.r2.cloudflarestorage.com
  }
  return STORAGE_ENDPOINT;
};

// Create S3 client configured for R2
// Using R2's S3-compatible API with the correct endpoint
const r2Client = STORAGE_ACCESS_KEY_ID && STORAGE_SECRET_ACCESS_KEY ? new S3Client({
  region: "auto",
  endpoint: getEndpointUrl(),
  credentials: {
    accessKeyId: STORAGE_ACCESS_KEY_ID,
    secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  },
}) : null;

/**
 * Upload file to R2 storage
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = 'application/octet-stream'
): Promise<string> {
  if (!r2Client) {
    throw new Error('R2 storage not configured');
  }

  const command = new PutObjectCommand({
    Bucket: STORAGE_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    // R2 doesn't support ACL, objects are public via the custom domain
  });

  await r2Client.send(command);

  // Return public URL
  return `${STORAGE_PUBLIC_URL}/${key}`;
}

/**
 * Delete file from R2 storage
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!r2Client) {
    throw new Error('R2 storage not configured');
  }

  const command = new DeleteObjectCommand({
    Bucket: STORAGE_BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);
}

/**
 * 从 R2 公网 URL 反推 key。
 * 例:`https://pub-xxx.r2.dev/selfies/u/abc.jpg` → `selfies/u/abc.jpg`。
 * 返回 null 时表示该 URL 不是 R2 上传产物(可能是 data URL 占位、provider URL 兜底等)。
 * 运行时读 env 以便测试与多租户场景动态生效。
 */
export function keyFromR2Url(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const base = process.env.STORAGE_PUBLIC_URL || '';
  if (!base) return null;
  const prefix = base.endsWith('/') ? base : base + '/';
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key.length > 0 ? key : null;
}

/**
 * 隐私清理用的 best-effort 删除:接受 URL,反推 key 后删除 R2 对象。
 * 不抛异常 — 失败只打日志。DB 字段无论如何必须清,R2 这边由 lifecycle rule 兜底。
 * 非 R2 来源的 URL(data URL / provider URL)直接 no-op。
 */
export async function tryDeleteFromR2Url(url: string | null | undefined): Promise<boolean> {
  const key = keyFromR2Url(url);
  if (!key) return false;
  if (!r2Client) return false;
  try {
    await deleteFromR2(key);
    return true;
  } catch (error) {
    console.error('[R2] tryDeleteFromR2Url failed for key', key, error);
    return false;
  }
}

/**
 * Parse a data URL into (contentType, buffer). Returns null for non-data URLs.
 * 形如 `data:image/png;base64,iVBOR...`
 */
function parseDataUrl(url: string): { contentType: string; buffer: Buffer } | null {
  if (!url.startsWith('data:')) return null;
  const commaIdx = url.indexOf(',');
  if (commaIdx === -1) return null;
  const meta = url.slice(5, commaIdx); // 去掉前缀 "data:"
  const payload = url.slice(commaIdx + 1);
  const isBase64 = /;base64/i.test(meta);
  const contentType = meta.replace(/;base64/i, '').split(';')[0] || 'image/png';
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf-8');
  return { contentType, buffer };
}

/**
 * Upload image from URL to R2
 * 支持普通 http(s) URL 与 base64 data: URL（用于 Gemini 等返回 inline 图像的模型）
 */
export async function uploadImageFromUrl(
  imageUrl: string,
  userId: string,
  type: 'image' | 'video' = 'image'
): Promise<string> {
  try {
    // If R2 is not configured, return original URL
    if (!isR2Configured()) {
      console.log('R2 not configured, using original URL');
      return imageUrl;
    }

    let contentType: string;
    let buffer: Buffer;

    const dataUrl = parseDataUrl(imageUrl);
    if (dataUrl) {
      contentType = dataUrl.contentType;
      buffer = dataUrl.buffer;
    } else {
      // Download资源时禁用 Next.js 数据缓存，避免超 2MB 限制
      const response = await fetch(imageUrl, {
        cache: 'no-store',
        next: { revalidate: 0 },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      contentType = response.headers.get('content-type') || 'image/png';
      buffer = Buffer.from(await response.arrayBuffer());
    }

    // Generate unique key with user folder structure
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = getExtensionFromContentType(contentType);
    const key = `${type}s/${userId}/${timestamp}_${random}.${extension}`;

    // Upload to R2
    const publicUrl = await uploadToR2(key, buffer, contentType);

    console.log(`Uploaded ${type} to R2:`, publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading to R2, using original URL:', error);
    // Fall back to original URL if upload fails
    return imageUrl;
  }
}

/**
 * Get file extension from content type
 */
function getExtensionFromContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  
  return typeMap[contentType] || contentType.split('/')[1] || 'bin';
}

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  return !!(STORAGE_ACCESS_KEY_ID && STORAGE_SECRET_ACCESS_KEY && STORAGE_PUBLIC_URL);
}
