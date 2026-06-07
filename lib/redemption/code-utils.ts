// 兑换码纯工具函数 - client safe(无 db / crypto / postgres import)。
// 拆出来让 client component (credits/page.tsx) 可 import 而不触发 postgres → fs/os bundling。
// 服务端用的 generateCode / generateBatch 留在 lib/redemption/codes.ts。

// 12 位码字符集 - 去掉 0/O/1/I/L 避免视觉混淆,共 31 字符
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;

/**
 * 规范化用户输入:
 * - 去掉所有非字母数字字符(如 dash/空格)
 * - 转大写
 * 注意: 输入字母可能不在白名单(如 O / I / L),保留交给上层判断"not found"
 */
export function normalizeCode(input: string): string {
  if (!input) return "";
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * 把 12 位码格式化成 "AAAA-BBBB-CCCC" 便于显示与分享
 */
export function formatCode(code: string): string {
  const c = (code ?? "").toUpperCase();
  if (c.length !== CODE_LENGTH) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

/**
 * 用户在输入框里"边输入边格式化":
 * - 去掉非字母数字,大写
 * - 每 4 位插入 dash,最多 14 字符 ("AAAA-BBBB-CCCC")
 */
export function formatVisualCode(input: string): string {
  const raw = normalizeCode(input).slice(0, CODE_LENGTH);
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    groups.push(raw.slice(i, i + 4));
  }
  return groups.join("-");
}
