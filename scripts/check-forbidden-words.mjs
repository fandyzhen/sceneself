// 合规禁止词扫描（SPEC 9.1）：面向用户的文案不得出现欺骗导向措辞。
// 定位口径必须是"创意/想象/趣味"，不得暗示真实经历/拥有/身份证明。
import { readFileSync, existsSync } from "node:fs";

const FORBIDDEN = [
  /\bfake\b/i,
  /\bdeceive\b/i,
  /\bcatfish\b/i,
  /\bfool (your|their|them|people)/i,
  /pretend (you|i) (went|bought|own|visited|have been|are)/i,
  /\bcheat(ing)? (your|on)\b/i,
  /\bproof (you|that you|of having)\b/i,
  /假装(去过|买了|拥有|是)/,
  /骗(人|朋友|过)/,
];

// 面向用户的文案来源（不扫代码内部的规则关键词，那些是审核逻辑而非展示文案）
const FILES = [
  "messages/en.json",
  "messages/zh.json",
  "messages/seo.en.json",
  "messages/seo.zh.json",
  "constants/billing.ts",
];

const violations = [];

function walk(value, path) {
  if (typeof value === "string") {
    for (const re of FORBIDDEN) {
      if (re.test(value)) violations.push({ path, text: value.slice(0, 80), pattern: re.toString() });
    }
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`);
  }
}

for (const file of FILES) {
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    walk(JSON.parse(raw), file);
  } else {
    // 源码文件：逐行扫字符串字面量里的禁止词
    raw.split("\n").forEach((line, i) => {
      for (const re of FORBIDDEN) {
        if (re.test(line)) violations.push({ path: `${file}:${i + 1}`, text: line.trim().slice(0, 80), pattern: re.toString() });
      }
    });
  }
}

if (violations.length) {
  console.error("❌ Forbidden / deceptive marketing wording found:");
  for (const v of violations) console.error(`  ${v.path}: "${v.text}"  ${v.pattern}`);
  process.exit(1);
}
console.log("✅ No forbidden/deceptive wording in user-facing copy.");
