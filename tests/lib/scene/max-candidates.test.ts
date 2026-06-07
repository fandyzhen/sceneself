// config 的 maxCandidatesPerFrame 决定每帧最多出图次数(attempt 0..N → N+1 次)。
// 曾试过默认 2 想保 6 张,但实测日志显示 identity 质检误判→失败帧反复重试,
// maxCandidates=2 让 anchor 串行第一张飙到 ~110s,6 张达成率却没明显提升(救援机制才是主力),
// 故回退到默认 1(每帧最多 2 次出图)。根治在降低 identity 质检误判,而非加大重试。
// 用源码断言而非运行时读 config:config 在模块顶层用 numEnv 求值,
// 易受其它测试 mock/env 污染;源码断言确定、零依赖。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("maxCandidatesPerFrame 默认值(每帧重试上限)", () => {
  it("config.ts 默认 SCENE_MAX_CANDIDATES 为 1(每帧最多 2 次出图,回退自 2)", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/scene/config.ts"), "utf8");
    expect(src).toMatch(/numEnv\(['"]SCENE_MAX_CANDIDATES['"],\s*1\)/);
  });
});
