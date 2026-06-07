import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock next/font/google:Fraunces 等在组件中 import,但 vitest jsdom 环境不支持 next 字体加载器。
// 测试只关心组件行为/文案,字体 className 返回空即可。
vi.mock("next/font/google", () => {
  const stub = () => ({ className: "", style: { fontFamily: "" }, variable: "" });
  return new Proxy({}, { get: () => stub });
});
