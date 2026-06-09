// 造型「优先级链」指令组装：把自拍画像（性别 + 发型）拼成给 LLM / 出图模型的造型规则。
// 只依赖类型，不引其它运行时模块（被 prompts.ts 与 scene-plan.ts 共用，避免循环依赖）。
//
// 优先级（解决「写死长发女性 → 男生/短发出错」与「用户单独对发型提诉求被盖掉」两个问题）：
//   ① 用户场景里对头发/外貌/性别呈现/服装的【明确诉求】> ② 自拍本人真实性别+发型 > ③ 活动适配（条件性）
import type { SelfieAppearance } from "./types";

function knownBits(appearance?: SelfieAppearance): string {
  const bits: string[] = [];
  if (appearance?.gender && appearance.gender !== "unclear") bits.push(`gender: ${appearance.gender}`);
  if (appearance?.hairLength) bits.push(`hair length: ${appearance.hairLength}`);
  if (appearance?.hairDesc) bits.push(`hair: ${appearance.hairDesc}`);
  return bits.join(", ");
}

// 完整版：注入到 storyline 造型生成（一次调用），让 attire 性别/发长一开始就设计对。
export function appearanceDirective(appearance?: SelfieAppearance): string {
  const known = knownBits(appearance);
  const selfieLine = known
    ? `The reference selfie shows — ${known}.`
    : `Read the reference selfie for the subject's real gender and hair.`;
  return [
    `STYLING IDENTITY — apply this STRICT PRIORITY ORDER when choosing hairstyle, body and any gender-specific clothing:`,
    `(1) USER REQUEST WINS: if the user's scene description explicitly asks for a specific hairstyle, hair length/color, baldness, beard, gender presentation, or a costume (e.g. "grow long black hair", "go blonde", "shaved head", "with a beard", "as a man / as a woman", a named character or period costume), follow THAT and let it override the selfie — this is a transformation the user wants.`,
    `(2) OTHERWISE MATCH THE SELFIE: ${selfieLine} Do NOT change the subject's gender and do NOT invent hair the subject does not have. A short-haired or male subject must NOT be given long flowing hair, a ponytail, a bun, braids, a dress, a skirt, a bikini, or any clearly feminine/masculine item that contradicts their real appearance. Choose clothing appropriate to the subject's actual gender.`,
    `(3) ACTIVITY STYLING IS CONDITIONAL: tying hair back or wearing a cap for active scenes (running, swimming, cycling, yoga, cooking) applies ONLY when the hair is genuinely long enough to tie AND it does not contradict (1) or (2). Short hair just stays neat and natural — never invent length to force a ponytail/bun. If the user wants loose long hair, keep it loose unless the activity truly forbids it.`,
  ].join(" ");
}

// 精简版：注入每帧 image_prompt（×6），只点核心规则，控 token。
export function appearanceFrameNote(appearance?: SelfieAppearance): string {
  const known = knownBits(appearance);
  const selfie = known ? `the reference selfie (${known})` : `the reference selfie`;
  return `Hair & gender (priority): honor any explicit hair/appearance/costume the user asked for; otherwise match ${selfie}'s real gender and hair exactly — do NOT add long hair, a ponytail, a bun, braids, a dress, a skirt or a bikini to a short-haired or male subject; only tie hair back / wear a cap if the hair is genuinely long and the scene is active. Keep this identical across all frames.`;
}
