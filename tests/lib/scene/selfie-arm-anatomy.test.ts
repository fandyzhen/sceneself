// 防回归:确保自拍 prompt 一致(顶层 system + 单帧 image_prompt 都说"NO arm reaching"),
// 以及 deformity 检测覆盖"unnatural limb proportions"(长胳膊/比例错)。
// 历史 bug:顶层 system prompt 允许"extended-arm selfie",但单帧 prompt 不让画手臂,
// 模型困惑 → 偶发画"过长的胳膊",且质检 deformity 只查"多余 3 只手"漏过去。
import { describe, it, expect } from "vitest";
import { SCENE_PLANNER_SYSTEM } from "@/lib/scene/prompts";
import { QUALITY_PROMPT } from "@/lib/scene/services/quality-check";

describe("selfie 解剖一致性", () => {
  it("顶层 system prompt 不再允许'extended-arm selfie'(与单帧 prompt 一致)", () => {
    expect(SCENE_PLANNER_SYSTEM).not.toMatch(/extended-arm selfie/i);
    expect(SCENE_PLANNER_SYSTEM).not.toMatch(/selfie with arm extended/i);
  });

  it("顶层 system prompt 显式指引'phone IS the camera, arm reaching toward the lens 是禁止的'", () => {
    // 跟 scene-plan.ts:424 的单帧 prompt 用同一语境
    expect(SCENE_PLANNER_SYSTEM).toMatch(/phone IS the camera/i);
    // 允许 "NO visible arm reaching" / "never an arm reaching" 等表述,只要明确禁止伸臂
    expect(SCENE_PLANNER_SYSTEM).toMatch(/(no\s+\w*\s*arm reaching|never\s+\w*\s*arm reaching|never show the hand)/i);
  });

  it("质检 deformity 定义覆盖'长胳膊 / 比例错'(限肢质检)", () => {
    expect(QUALITY_PROMPT).toMatch(/limb proportions/i);
    expect(QUALITY_PROMPT).toMatch(/unnaturally long|stretched/i);
  });

  it("质检 deformity 明确说'好脸不能赦免坏胳膊'", () => {
    expect(QUALITY_PROMPT).toMatch(/face does NOT excuse|does NOT excuse a wrong arm/i);
  });
});
