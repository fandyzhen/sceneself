// SceneOrchestrator（SPEC 5.7）：三道及格线（像 + 真 + 组一致）+ 选择性多候选 + 封面优先。
// runGeneration 是纯逻辑状态机（依赖注入，可独立测试）；runJob 组装真实 service/repository。
import type { ScenePlan, ShotSpec, QualityResult, SetCoherenceResult, FrameStatus, FailReason } from "./types";
import * as repo from "./repository";
import { sceneConfig } from "./config";
import { hasFaceOcclusion } from "./scene-plan";
import { generateSceneImage, checkQuality, swapFace, checkSetCoherence } from "./services";
import { inlineImageUrl } from "./services/image-inline";
import { uploadImageFromUrl } from "../r2-storage";
import { refundForUndelivered } from "./pricing";
import { refundCredits } from "../credits";

export interface FrameOutcome {
  index: number;
  status: FrameStatus;
  imageUrl?: string;
  qualityScore?: number;
  identityScore?: number;
  failReason?: FailReason;
  candidatesTried: number;
  isCover: boolean;
}

export interface OrchestratorDeps {
  generateSet?: (plan: ScenePlan, refs: string[]) => Promise<Map<number, string>>;
  generateImage: (shot: ShotSpec, refs: string[], seed: string) => Promise<{ index: number; imageUrl: string }>;
  checkQuality: (selfieUrl: string, candidateUrl: string) => Promise<QualityResult>;
  swapFace: (targetUrl: string, selfieUrl: string) => Promise<{ imageUrl: string } | null>;
  checkSetCoherence: (selfieUrl: string, frameUrls: string[], plan: ScenePlan) => Promise<SetCoherenceResult>;
  onFrame?: (outcome: FrameOutcome) => Promise<void> | void;
  onCover?: (index: number) => Promise<void> | void;
  qualityMin?: number;
  salvageQualityMin?: number;
  maxCandidates?: number;
  // 单帧 passes() 内的 identity 容错门槛(默认 sceneConfig.identityOverrideQuality=4)。
  // runGeneration 检测到含遮挡 outfit(helmet/cap/toque/mask 等)时会自动下调到 qualityMin,
  // 等价于"遮挡场景下 quality 过 qualityMin 即接受 not same_person 误判",
  // 配合 buildFramePromptFromBeat 端的 face crop 放大 + 露脸指令,综合解决 67%→17% 仍偶发 33% 的浮动。
  identityOverrideQuality?: number;
  // dropped 帧救援尝试次数(成功即停)。生产环境从 sceneConfig.rescueAttempts 注入(默认 2);
  // 测试默认 1 兼容旧断言(delivery-recovery.test.ts)。
  // 轮次制:这是"基础救援"的轮数,无条件跑完,不受时间预算限制。
  rescueAttempts?: number;
  // 时间预算(毫秒)。注入则在基础救援后启用"额外救援轮"——只要还有 dropped 帧
  // 且剩余时间 ≥ 0.5×单轮耗时,就继续补救,尽量凑齐 6 张。不注入(单测)则不跑额外轮,
  // 行为与重构前一致。计时从 runGeneration 入口起算。
  timeBudgetMs?: number;
  // 单轮救援估计耗时(毫秒,实测 ~20s)。额外救援阈值 = 0.5×该值。
  rescueRoundMs?: number;
  // 开启后：先串行出第1帧作为"组内视觉锚"，再把它作为额外 reference 喂给其余帧并发出图，
  // 大幅提升 outfit 颜色 / 配饰位置 / anchor 物体内饰色的组内一致性（代价：总耗时多一个单帧）。
  referenceChaining?: boolean;
}

export interface GenerationResult {
  frames: FrameOutcome[];
  delivered: number;
  status: "completed" | "partial";
  coherence?: SetCoherenceResult;
}

// ①像 + ②真：单帧及格线（③组一致在 SetCoherenceCheck）
// 单帧及格：无畸形/塑料皮 + 质量达标；same_person 直接过，
// 或质量很高(>=identityOverrideQuality)时容忍 same_person 误判(除非 identityStrict)。
export function passes(
  q: QualityResult,
  qualityMin: number,
  opts?: { overrideQuality?: number; strict?: boolean },
): boolean {
  if (q.deformity || q.plastic_skin) return false;
  if (q.quality < qualityMin) return false;
  if (q.same_person) return true;
  const strict = opts?.strict ?? sceneConfig.identityStrict;
  const override = opts?.overrideQuality ?? sceneConfig.identityOverrideQuality;
  return !strict && q.quality >= override;
}

// 单帧：首次出图 + 选择性多候选；仍不过分流：
//   (a) salvage：best 候选像本人 + 质量不太差 → 保底展示（保证 6/6 交付）
//   (b) identity：不像本人 → 换脸兜底
//   (c) realism：塑料皮/畸形/极差 → 真的 drop
async function resolveFrame(
  shot: ShotSpec,
  selfieUrl: string,
  refs: string[],
  deps: OrchestratorDeps,
  initialUrl?: string,
): Promise<FrameOutcome> {
  const qualityMin = deps.qualityMin ?? 3;
  const maxCandidates = deps.maxCandidates ?? 3;
  const salvageQualityMin = deps.salvageQualityMin ?? Math.max(2, qualityMin - 1);
  const passOpts = deps.identityOverrideQuality !== undefined
    ? { overrideQuality: deps.identityOverrideQuality }
    : undefined;

  let best: { url: string; q: QualityResult } | null = null;
  let tried = 0;

  for (let attempt = 0; attempt <= maxCandidates; attempt++) {
    // 每个 candidate 包 try-catch:单次 generate / checkQuality 失败(API 超时 / 限流 / OpenRouter 拒)
    // 不整 frame 崩,继续跑下个 attempt,把"早期 throw → 整帧 dropped 且 candidatesTried=0"的硬伤消除。
    try {
      // 第一次优先用组图给的整组图；之后单张重抽补救
      let url: string;
      if (attempt === 0 && initialUrl) {
        url = initialUrl;
      } else {
        const gen = await deps.generateImage(shot, refs, `${shot.index}-${attempt}`);
        url = gen.imageUrl;
      }
      tried++;
      const q = await deps.checkQuality(selfieUrl, url);
      if (passes(q, qualityMin, passOpts)) {
        return {
          index: shot.index,
          status: "passed",
          imageUrl: url,
          qualityScore: q.quality,
          identityScore: q.same_person ? 1 : 0,
          candidatesTried: tried,
          isCover: false,
        };
      }
      if (!best || q.quality > best.q.quality) best = { url, q };
    } catch (error) {
      console.warn(`[resolveFrame] shot ${shot.index} attempt ${attempt} threw, trying next candidate:`, error);
    }
  }

  // 多候选都不过质检。优先级：salvage > swap > drop。
  // salvage：best 像本人 + 质量不太差（避免出现"交付 5/6"硬伤的用户感受）。
  if (best && best.q.same_person && best.q.quality >= salvageQualityMin) {
    return {
      index: shot.index,
      status: "passed",
      imageUrl: best.url,
      qualityScore: best.q.quality,
      identityScore: 1,
      candidatesTried: tried,
      isCover: false,
    };
  }

  // 不像本人 → 换脸兜底
  const failReason: FailReason = best && !best.q.same_person ? "identity" : "realism";
  if (failReason === "identity" && best) {
    const swapped = await deps.swapFace(best.url, selfieUrl);
    if (swapped) {
      return {
        index: shot.index,
        status: "swapped",
        imageUrl: swapped.imageUrl,
        qualityScore: best.q.quality,
        identityScore: 1,
        candidatesTried: tried,
        isCover: false,
      };
    }
  }
  return { index: shot.index, status: "dropped", failReason, candidatesTried: tried, isCover: false };
}

// 并发限制：火山时代是 3（Seedream 5.0 + base64 inline 6 并发会全部 timeout）。
// 切到 OpenRouter Gemini Nano Banana 2 后服务端无 base64 inline 瓶颈，6 张可一批并发出齐
// （~50-80s/batch），单组总耗时压缩到 ~100-130s（含质检 + dropped 重跑）。
// 可通过 SCENE_FRAME_CONCURRENCY 环境变量覆盖，OpenRouter 限流（429）时回落到 3。
const FRAME_CONCURRENCY = Number(process.env.SCENE_FRAME_CONCURRENCY) || 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runGeneration(
  plan: ScenePlan,
  selfieUrl: string,
  refs: string[],
  deps: OrchestratorDeps,
): Promise<GenerationResult> {
  // 时间预算计时起点（总墙钟从这里算）。额外救援轮据此判断剩余时间。
  const startTs = Date.now();
  // 含遮挡 outfit(helmet/cap/toque/mask 等)的场景下,人脸识别准确率天然受压。
  // 用户产品判断:"露出部分+身体轮廓能识别就该放行"——主要针对 identity 那一关,
  // quality 仍走 qualityMin 底线(图本身糊就该 drop)。
  // identityOverrideQuality 默认 4 → 遮挡时降到 qualityMin,等于"quality 过线就接受 not same_person 误判"。
  // 注意:畸形/塑料皮仍一票否决,不放宽底线。
  const occluded = plan.continuity?.outfit ? hasFaceOcclusion(plan.continuity.outfit) : false;
  const effectiveDeps: OrchestratorDeps = occluded && deps.identityOverrideQuality === undefined
    ? { ...deps, identityOverrideQuality: deps.qualityMin ?? sceneConfig.qualityMin }
    : deps;

  // 单帧处理：resolveFrame（首图 + 多候选 + salvage/swap）+ try-catch + onFrame 落库。
  // 每帧自己 try-catch 网络错误 → 标 dropped，避免一帧 timeout 让其他帧成果丢失。
  const runOneFrame = async (shot: ShotSpec, frameRefs: string[], initialUrl?: string): Promise<FrameOutcome> => {
    try {
      const o = await resolveFrame(shot, selfieUrl, frameRefs, effectiveDeps, initialUrl);
      if (deps.onFrame) await deps.onFrame(o);
      return o;
    } catch (error) {
      console.error(`[runGeneration] frame ${shot.index} aborted:`, error);
      const dropped: FrameOutcome = {
        index: shot.index,
        status: "dropped",
        failReason: "realism",
        candidatesTried: 0,
        isCover: false,
      };
      if (deps.onFrame) await deps.onFrame(dropped);
      return dropped;
    }
  };

  let outcomes: FrameOutcome[];

  if (deps.referenceChaining && plan.shots.length > 1 && !deps.generateSet) {
    // ── Reference chaining（组一致性最强）──
    // 阶段1：先串行出第 1 帧（锚定帧），建立 outfit 颜色 / 配饰位置 / anchor 物体内饰色的视觉基准。
    // 阶段2：把锚定帧作为额外 reference 喂给其余帧并发出图 —— 模型能"看到"第1帧的样子，
    //        从而跨帧保持一致（解决：包跨左/右、座椅颜色变、衣服色变）。
    const [first, ...rest] = plan.shots;
    const firstOutcome = await runOneFrame(first, refs);
    const anchorUrl =
      (firstOutcome.status === "passed" || firstOutcome.status === "swapped") && firstOutcome.imageUrl
        ? firstOutcome.imageUrl
        : undefined;
    if (!anchorUrl) {
      console.warn("[runGeneration] reference chaining: anchor frame did not pass; rest fall back to original refs");
    }
    const enrichedRefs = anchorUrl ? [...refs, anchorUrl] : refs;
    const restOutcomes = await mapWithConcurrency(rest, FRAME_CONCURRENCY, shot => runOneFrame(shot, enrichedRefs));
    outcomes = [firstOutcome, ...restOutcomes];
  } else {
    // 组图一次出整组（SPEC 5.4）/ 或纯并发逐帧（reference chaining 关闭时）。
    const initial = deps.generateSet ? await deps.generateSet(plan, refs) : new Map<number, string>();
    outcomes = await mapWithConcurrency(plan.shots, FRAME_CONCURRENCY, shot =>
      runOneFrame(shot, refs, initial.get(shot.index)),
    );
  }

  // 封面优先：passed 中质量最高者（并列取第一）；用 onCover 单独补标，避免重复 onFrame/R2 上传
  const passed = outcomes.filter(o => o.status === "passed");
  if (passed.length > 0) {
    let cover = passed[0];
    for (const o of passed) if ((o.qualityScore ?? 0) > (cover.qualityScore ?? 0)) cover = o;
    cover.isCover = true;
    if (deps.onCover) await deps.onCover(cover.index);
  }

  // 组一致性检查已移除：其结果(coherence)全项目无人读取/落库/拦截，是 5-20s 的阻塞浪费。
  // 保留 deps.checkSetCoherence 注入与 set-coherence-check 模块，未来要用可重启用。
  const kept = outcomes.filter(o => o.status === "passed" || o.status === "swapped");
  const coherence: SetCoherenceResult | undefined = undefined;

  // 救交付率：对 status=dropped 的帧多次重跑（默认 rescueAttempts=2 次,成功即停）。
  // 改自 v1 的"LLM weak_frames 重跑"（重跑 passed 帧不会改善 6/6 交付率,浪费 30s/帧）。
  // 现在改为"对 dropped 帧重跑"：partial → 救成 completed,6/6 显著改善。
  //
  // 两个增强(v3):
  //  1. 多次尝试 rescueAttempts(默认 2): 一次救不回的(模型不稳/质检误判)再来一次,实测能再多救 20-30%。
  //     成功即停,不浪费额度;失败不阻塞别的 dropped 帧(各自 Promise.all 内独立 retry)。
  //  2. 不依赖 kept 非空: 全 dropped 时也救(用原 refs 而非 benchmark),否则极端场景一帧都没救。
  // ── 救援（轮次制 + 时间预算）──────────────────────────────────────
  // 一"轮" = 对所有仍 dropped 的帧并发各补救 1 次（多帧并发 ≈ 单帧墙钟）。
  // ① 基础救援：跑 rescueAttempts 轮，无条件，不受时间预算限制。
  // ② 额外救援：基础跑完仍有 dropped 时，只要 剩余时间 ≥ 0.5×单轮耗时 就继续补，
  //    直到凑齐 / 剩余不足 / 超预算。目的：在 ~90s 内尽最大可能交付 6 张。
  if (outcomes.some(o => o.status === "dropped")) {
    // 有 passed 帧时附加最高质量帧作 reference;无则用原 refs(全 dropped 也能救)
    let rescueRefs = refs;
    if (kept.length > 0) {
      const benchmark = [...kept].sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))[0];
      if (benchmark?.imageUrl) rescueRefs = [...refs, benchmark.imageUrl];
    }
    const salvageMin = deps.salvageQualityMin ?? Math.max(2, (deps.qualityMin ?? 3) - 1);
    // deps 注入默认 1(旧测试兼容: delivery-recovery.test.ts 断言 frame1Reruns=1);
    // runJob 装配传 sceneConfig.rescueAttempts=2,生产环境默认 2 次。
    const baseAttempts = deps.rescueAttempts ?? 1;

    // 单帧单次补救：成功就地更新 outcome（救成的帧后续轮自动跳过）。
    const rescueOnce = async (drop: FrameOutcome, tag: string): Promise<void> => {
      const shot = plan.shots.find(s => s.index === drop.index);
      if (!shot) return;
      try {
        const fresh = await deps.generateImage(shot, rescueRefs, `${drop.index}-${tag}`);
        const q = await deps.checkQuality(selfieUrl, fresh.imageUrl);
        // 救援放宽:quality >= salvageMin 即接受(不再强 same_person)。vision LLM 在
        // close-up/wide 边缘会误判 same_person=false,但 hair/outfit/silhouette 已组内一致。
        if (q.quality >= salvageMin && !q.deformity) {
          drop.status = "passed";
          drop.imageUrl = fresh.imageUrl;
          drop.qualityScore = q.quality;
          drop.identityScore = 1;
          drop.failReason = undefined;
          drop.candidatesTried = (drop.candidatesTried ?? 0) + 1;
          if (deps.onFrame) await deps.onFrame(drop);
        } else {
          console.log(`[runGeneration] rescue ${tag} frame ${drop.index} still failed (q=${q.quality}, same=${q.same_person})`);
        }
      } catch (error) {
        console.warn(`[runGeneration] rescue ${tag} frame ${drop.index} threw:`, error);
      }
    };

    // 一轮：并发补救所有仍 dropped 的帧。返回本轮开始时是否还有 dropped。
    const runRound = async (tag: string): Promise<boolean> => {
      const stillDropped = outcomes.filter(o => o.status === "dropped");
      if (stillDropped.length === 0) return false;
      await Promise.all(stillDropped.map(d => rescueOnce(d, tag)));
      return true;
    };

    // ① 基础救援：rescueAttempts 轮，无条件。tag 含 "rerun" 以兼容既有 seed 语义/测试。
    for (let r = 1; r <= baseAttempts; r++) {
      if (!(await runRound(`rerun-${r}`))) break;
    }

    // ② 额外救援：受时间预算约束（仅当注入 timeBudgetMs，生产启用、单测不启用）。
    if (deps.timeBudgetMs && deps.timeBudgetMs > 0) {
      const roundMs = deps.rescueRoundMs && deps.rescueRoundMs > 0 ? deps.rescueRoundMs : 20_000;
      const minRemainMs = roundMs * 0.5; // 剩余不足"半轮"就不再开新轮
      let extra = 0;
      while (outcomes.some(o => o.status === "dropped")) {
        const remainingMs = deps.timeBudgetMs - (Date.now() - startTs);
        if (remainingMs < minRemainMs) {
          console.log(`[runGeneration] extra rescue stop: remaining ${Math.round(remainingMs / 1000)}s < threshold ${Math.round(minRemainMs / 1000)}s`);
          break;
        }
        extra++;
        console.log(`[runGeneration] extra rescue round ${extra}: remaining ${Math.round(remainingMs / 1000)}s, dropped=${outcomes.filter(o => o.status === "dropped").length}`);
        await runRound(`rerun-extra-${extra}`);
      }
      if (extra > 0) {
        console.log(`[runGeneration] extra rescue done after ${extra} round(s), elapsed ${Math.round((Date.now() - startTs) / 1000)}s, dropped=${outcomes.filter(o => o.status === "dropped").length}`);
      }
    }
  }

  // rerun 后重新统计：rescue 成功的 dropped → passed，应该计入 delivered
  const finalKept = outcomes.filter(o => o.status === "passed" || o.status === "swapped");
  const delivered = finalKept.length;
  const status: "completed" | "partial" = delivered >= plan.shots.length ? "completed" : "partial";
  return { frames: outcomes, delivered, status, coherence };
}

// 门面：组装真实 service + repository + R2，供 API 触发。单函数内跑完（SPEC 1.5）。
export async function runJob(jobId: string): Promise<void> {
  console.log(`[SceneOrchestrator] runJob START ${jobId}`);
  const job = await repo.getJob(jobId);
  if (!job || !job.scenePlan || !job.selfieUrl) {
    console.error(
      `[SceneOrchestrator] runJob ${jobId} early exit: jobExists=${!!job} scenePlan=${!!job?.scenePlan} selfieUrl=${!!job?.selfieUrl}`,
    );
    if (job) await repo.updateJob(jobId, { status: "failed" });
    return;
  }

  await repo.updateJob(jobId, { status: "generating" });

  const plan = job.scenePlan;
  // 关键：把 selfie / refs 在 Vercel 端拉下来 inline 成 data:image/jpeg;base64，
  // 让火山方舟不需要主动跨境下载 R2（实测会 80s+ timeout）。
  // 失败回退到原 URL（保留旧行为，至少能 fail loudly）。
  let inlinedSelfie = job.selfieUrl;
  try {
    inlinedSelfie = await inlineImageUrl(job.selfieUrl);
    console.log(`[SceneOrchestrator] runJob ${jobId} selfie inlined (${inlinedSelfie.length} bytes data URL)`);
  } catch (error) {
    console.error(`[SceneOrchestrator] runJob ${jobId} inline selfie failed, using raw URL:`, error);
  }
  const rawRefs = job.identityRef?.selfieUrls?.length ? job.identityRef.selfieUrls : [job.selfieUrl];
  const refs: string[] = await Promise.all(
    rawRefs.map(async u => {
      try {
        return await inlineImageUrl(u);
      } catch {
        return u;
      }
    }),
  );
  const ownerId = job.userId ?? jobId;

  // 确保 frames 存在（pending）
  let frameRows = await repo.listFrames(jobId);
  if (frameRows.length === 0) {
    frameRows = await repo.insertFrames(jobId, plan.shots);
  }
  const frameByIndex = new Map(frameRows.map(f => [f.index, f]));
  console.log(
    `[SceneOrchestrator] runJob ${jobId} starting generation: shots=${plan.shots.length} frames=${frameRows.length} tier=${job.tier} imageModel=${sceneConfig.imageModel}`,
  );

  try {
    const result = await runGeneration(plan, inlinedSelfie, refs, {
      // 逐帧并行出图：Seedream 组图模式（sequential）实测 4 张 131s（串行），9 张会超 Vercel 300s；
      // 逐帧并行 ~30s，组一致性靠参考图 + continuity prompt（质检已验证达标）。
      // generateSceneSet 保留为可选的"高一致性慢模式"，默认不启用（不传 generateSet 即逐帧）。
      generateImage: (shot, r, seed) => generateSceneImage(shot, r, { seed, watermark: job.tier !== "paid" }),
      checkQuality,
      swapFace,
      checkSetCoherence,
      qualityMin: sceneConfig.qualityMin,
      salvageQualityMin: sceneConfig.salvageQualityMin,
      maxCandidates: sceneConfig.maxCandidatesPerFrame,
      rescueAttempts: sceneConfig.rescueAttempts,
      // 时间预算：基础救援后,只要 90s 内还有余量就额外补救,尽量凑齐 6 张。
      timeBudgetMs: sceneConfig.timeBudgetSeconds * 1000,
      rescueRoundMs: sceneConfig.rescueRoundSeconds * 1000,
      referenceChaining: sceneConfig.referenceChaining,
      // 边生成边落库：函数中途崩了也保留已完成帧（SPEC 1.5）
      onFrame: async o => {
        console.log(
          `[SceneOrchestrator] frame ${o.index} status=${o.status} q=${o.qualityScore} id=${o.identityScore} tried=${o.candidatesTried} fail=${o.failReason ?? "-"}`,
        );
        const row = frameByIndex.get(o.index);
        if (!row) return;
        let url = o.imageUrl ?? null;
        if (url && (o.status === "passed" || o.status === "swapped")) {
          url = await uploadImageFromUrl(url, ownerId, "image"); // 无 R2 自动降级返回原 URL
        } else if (o.status === "dropped") {
          url = null; // dropped 永不展示
        }
        await repo.updateFrame(row.id, {
          status: o.status,
          imageUrl: url,
          qualityScore: o.qualityScore ?? null,
          identityScore: o.identityScore ?? null,
          failReason: o.failReason ?? null,
          candidatesTried: o.candidatesTried,
          isCover: o.isCover,
        });
      },
      // 封面补标：单独更新 isCover 列，不重新上传（避免重复 R2）
      onCover: async index => {
        const row = frameByIndex.get(index);
        if (row) await repo.updateFrame(row.id, { isCover: true });
      },
    });

    console.log(
      `[SceneOrchestrator] runJob ${jobId} runGeneration done: status=${result.status} delivered=${result.delivered}/${plan.shots.length}`,
    );
    await repo.updateJob(jobId, { status: result.status, completedAt: new Date() });
    // v2：按未交付张数返还积分（预扣 300，交付 N 张退 (6-N)×50）
    const refund = refundForUndelivered(result.delivered, plan.shots.length);
    if (job.userId && refund > 0) {
      await refundCredits(job.userId, refund, "scene_refund", jobId);
    }
    // 隐私清理（SPEC 9.2）：交付后清自拍 + 身份特征
    await repo.purgeIdentity(jobId);
  } catch (error) {
    // 关键日志：原来无声 catch 让根因不可见（如 API key/模型 ID/超时）。
    // 失败保留自拍，便于用户免费重试；超时由 SELFIE_RETENTION_HOURS 定时清理兜底
    console.error(`[SceneOrchestrator] runJob ${jobId} failed:`, error);
    await repo.updateJob(jobId, { status: "failed" });
    // 整批失败兜底：把预扣的 credits 全额退还（用户没拿到任何东西）。
    // 之前缺这段导致 failed job 用户白扣 300。
    if (job.userId && job.creditsCost > 0) {
      try {
        await refundCredits(job.userId, job.creditsCost, "scene_refund", jobId);
        console.log(`[SceneOrchestrator] runJob ${jobId} refunded ${job.creditsCost} credits to ${job.userId}`);
      } catch (refundError) {
        console.error(`[SceneOrchestrator] runJob ${jobId} refund failed:`, refundError);
      }
    }
  }
}
