"use client";

// SceneFormShell — 替代旧通用 FormShell,品牌色 + amber border + 暗背景。
// 接口与 FormShell 100% 兼容,4 个 auth form 只需改 import 即可换风。

import * as React from "react";
import { UseFormReturn, FieldValues } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Fraunces } from "next/font/google";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "600"], style: ["italic", "normal"], display: "swap" });

interface SceneFormShellProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  title: string;
  description?: string;
  onSubmit: (values: TFieldValues) => Promise<void> | void;
  children: React.ReactNode;
  submitText: string;
  submitLoadingText?: string;
  isLoading?: boolean;
  error?: string | null;
  footer?: React.ReactNode;
  className?: string;
  headerSlot?: React.ReactNode;
  socialSlot?: React.ReactNode;
}

export function SceneFormShell<TFieldValues extends FieldValues>({
  form,
  title,
  description,
  onSubmit,
  children,
  submitText,
  submitLoadingText,
  isLoading,
  error,
  footer,
  className,
  headerSlot,
  socialSlot,
}: SceneFormShellProps<TFieldValues>) {
  const t = useTranslations("auth.social");
  return (
    <Form {...form}>
      <div className={cn("w-full", className)}>
        {headerSlot}
        <h2 className={cn(display.className, "text-3xl font-medium leading-tight text-stone-50 sm:text-4xl")}>
          {title}
        </h2>
        {description && <p className="mt-3 text-sm leading-relaxed text-stone-400">{description}</p>}

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5">
          {children}

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-200 to-orange-300 px-6 py-3.5 text-[15px] font-semibold text-stone-900 shadow-[0_10px_36px_-10px_rgba(245,178,120,0.55)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? submitLoadingText ?? submitText : submitText}
          </button>

          {footer && <div className="text-sm text-stone-400">{footer}</div>}
        </form>

        {socialSlot && (
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-amber-200/[0.08]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-stone-950 px-4 uppercase tracking-[0.2em] text-stone-500">{t("or")}</span>
              </div>
            </div>
            <div className="mt-5">{socialSlot}</div>
          </div>
        )}
      </div>
    </Form>
  );
}
