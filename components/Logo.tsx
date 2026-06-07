"use client";
import Link from "next/link";
import React from "react";
import { Fraunces } from "next/font/google";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["500", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

// Logo — 纯文字品牌标识 (Fraunces italic SceneSelf)，与 SceneNavBar 风格一致。
// 原教堂 SVG 已删 (来自旧模板)，保留 named export 以兼容 blog / form-shell / nav 等
// 6 处历史消费者。
export const Logo = () => {
  return (
    <Link
      href="/"
      className="font-normal flex items-center text-sm mr-4 text-foreground px-2 py-1 relative z-20"
    >
      <span className={`${display.className} text-base font-medium italic`}>
        SceneSelf
      </span>
    </Link>
  );
};
