// IntentRewriter（SPEC 5.2.1）：保留用户视觉/情绪目标，把高风险字面表达转为
// creative/editorial/imagined 口径；硬性安全边界（名人/NSFW/未成年人/诈骗）一律 blocked。
// MVP 用本地规则引擎；接口稳定，后续可换更强的 LLM 改写而不动调用方。
import type { RewriteResult, RewriteReason } from "../types";

const SOFT_NOTICE = "Created as an imagined editorial scene.";
const BLOCK_NOTICE = "We can only create imagined, creative scenes of you — not this idea.";

// 1) 硬边界：无法靠改写绕过，一律 blocked（SPEC 5.2.1 / 9.3）
const BLOCK_PATTERNS: RegExp[] = [
  // 未成年人
  /\b(underage|minor|child|children|kid|kids|teen|teenage|preteen|toddler|infant)\b/i,
  // NSFW / 色情
  /\b(nude|naked|nsfw|porn|pornographic|explicit|sexual|erotic|nipple|genital)\b/i,
  // 暴力 / 仇恨 / 违法
  /\b(gore|behead|nazi|isis|terrorist|massacre)\b/i,
  // 伪造证件 / 诈骗
  /\b(passport|id\s?card|driver'?s?\s?licen[sc]e|forged|counterfeit|fake\s+(document|id|passport)|scam|fraud)\b/i,
];

// 名人 / 公众人物（MVP 显式小名单 + 通用词）；冒充真实特定个人 → blocked
const PUBLIC_FIGURES = [
  "donald trump", "joe biden", "barack obama", "elon musk", "taylor swift",
  "kim kardashian", "cristiano ronaldo", "lionel messi", "xi jinping",
  "vladimir putin", "mark zuckerberg", "jeff bezos", "bill gates",
];
function mentionsPublicFigure(text: string): boolean {
  const t = text.toLowerCase();
  if (PUBLIC_FIGURES.some(n => t.includes(n))) return true;
  return /\b(celebrity|public figure|the president|prime minister|a famous (actor|singer|politician))\b/i.test(text);
}

interface RewriteRule {
  reason: Exclude<RewriteReason, "none" | "blocked">;
  test: RegExp;
  transform: (raw: string) => string;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// 2) 高风险字面 → creative/editorial（按优先级，匹配第一条即用）
const REWRITE_RULES: RewriteRule[] = [
  {
    reason: "proof_to_editorial",
    test: /\b(prove|proof of|evidence (that|of))\b/i,
    transform: raw => {
      const subject = collapse(
        raw
          .replace(/\b(prove|proof of|evidence (that|of))\b/gi, "")
          .replace(/\bi\s+(was|went|have been)\s+(in|to|at)?\b/gi, ""),
      );
      return collapse(`imagined ${subject} travel editorial scene set`);
    },
  },
  {
    reason: "deception_to_imagined",
    test: /\bfake\b/i,
    transform: raw => collapse(`${raw.replace(/\bfake\b/gi, "imagined")} photo set`),
  },
  {
    reason: "deception_to_imagined",
    test: /\bpretend(ed|ing)?\s+(i\s+)?(went|visited|was|have been|to have)\b|make it look like i (went|visited|was)\b/i,
    transform: raw => {
      const subject = collapse(
        raw
          .replace(/\bpretend(ed|ing)?\s+(i\s+)?(went to|visited|went|was (in|at)?|have been (in|to)?|to have)\b/gi, "")
          .replace(/make it look like i (went to|visited|went|was (in|at)?)\b/gi, ""),
      );
      return collapse(`imagined ${subject} photo set`);
    },
  },
  {
    reason: "ownership_to_lifestyle",
    test: /\bmake me look rich\b|\b(rich|wealthy)\s+(lifestyle|vibe|aesthetic)\b/i,
    transform: () => "luxury lifestyle editorial scene set",
  },
  {
    reason: "ownership_to_lifestyle",
    test: /\b(pretend\s+)?i\s+own\b|\bmy\s+(ferrari|lamborghini|lambo|porsche|yacht|jet|mansion|rolex)\b|\bi\s+bought\b|\bflex\b/i,
    transform: raw => {
      const obj = collapse(
        raw
          .replace(/\b(pretend\s+)?i\s+own\s+(a|an|my)?\b/gi, "")
          .replace(/\bmy\b/gi, "")
          .replace(/\bi\s+bought\s+(a|an)?\b/gi, "")
          .replace(/\bflex\b/gi, ""),
      );
      const subject = obj.length > 0 ? obj : "lifestyle";
      return collapse(`luxury ${subject} editorial scene set`);
    },
  },
  {
    reason: "brand_or_org_to_generic",
    test: /\b(ceo|president|founder|director)\s+of\s+[a-z0-9'&.\- ]+/i,
    transform: raw => {
      const style = /\bpresident\b/i.test(raw) ? "executive-style" : "CEO-style";
      return collapse(
        raw.replace(
          /\b(ceo|president|founder|director)\s+of\s+[a-z0-9'&.\- ]+?(\b(in|at|on|with|,)\b|$)/i,
          `${style} office portrait set $2`,
        ),
      );
    },
  },
];

export interface RewriteInput {
  rawPrompt: string;
  userId?: string;
}

export async function rewriteIntent(input: RewriteInput): Promise<RewriteResult> {
  const raw = input.rawPrompt.trim();

  if (BLOCK_PATTERNS.some(p => p.test(raw)) || mentionsPublicFigure(raw)) {
    return { safePrompt: "", rewriteApplied: true, rewriteReason: "blocked", userNotice: BLOCK_NOTICE };
  }

  for (const rule of REWRITE_RULES) {
    if (rule.test.test(raw)) {
      return { safePrompt: rule.transform(raw), rewriteApplied: true, rewriteReason: rule.reason, userNotice: SOFT_NOTICE };
    }
  }

  return { safePrompt: raw, rewriteApplied: false, rewriteReason: "none" };
}
