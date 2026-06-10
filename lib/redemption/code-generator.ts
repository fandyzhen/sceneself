import crypto from "crypto";
import { ALPHABET, CODE_LENGTH } from "./code-utils";

/**
 * 生成一个 12 位随机兑换码(大写)。使用 crypto.randomBytes 保证不可预测。
 * 无 DB import,方便纯工具测试不拉起 postgres client。
 */
export function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return s;
}
