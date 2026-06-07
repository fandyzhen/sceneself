// SceneSelf 可替换 service 层的聚合出口。
export { rewriteIntent } from "./intent-rewriter";
export type { RewriteInput } from "./intent-rewriter";
export { screenPrompt, isBlocked } from "./prompt-moderation";
export type { ScreenInput } from "./prompt-moderation";
export { classifyScene, generateClarifyingQuestions, buildScenePlan, analyzeInput, storylineDef, generateSafeAlternatives } from "./scene-planner";
export type { InputAnalysis } from "./scene-planner";
export { generateStoryline, fallbackStoryline } from "./story-line";
export type { StorylineInput } from "./story-line";
export { generateSceneImage, generateSceneImages, generateSceneSet, buildSetPrompt } from "./image-gen";
export type { SceneImageResult } from "./image-gen";
export { checkQuality, framePasses } from "./quality-check";
export { checkIdentity } from "./identity-check";
export { checkSetCoherence, setPasses } from "./set-coherence-check";
export { swapFace } from "./face-swap";
export { checkUpload } from "./upload-gate";
export { checkFace } from "./face-check";
export type { FaceCheckResult } from "./face-check";
