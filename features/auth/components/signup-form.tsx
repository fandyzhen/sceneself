"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from 'next-intl';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { signIn, signUp } from "@/lib/auth-client";
import Password from "@/components/password";
import { SceneFormShell as FormShell } from "@/features/auth/components/scene-form-shell";
import { FormTextField } from "@/features/forms/components/form-text-field";
import { SocialAuthButtons } from "@/features/auth/components/social-auth-buttons";
import { SignupInput, signupSchema } from "@/features/auth/schemas";

interface SignupFormProps {
  showGoogleAuth?: boolean;
}

export function SignupForm({ showGoogleAuth = true }: SignupFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('auth.signup');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      marketingOptIn: false,
    },
  });

  async function onSubmit(values: SignupInput) {
    try {
      setIsLoading(true);
      setError(null);

      const { error } = await signUp.email({
        email: values.email,
        password: values.password,
        name: values.name,
      });

      if (error) {
        setError(error.message || t('errors.signupFailed'));
        return;
      }

      try {
        const verificationResponse = await fetch('/api/auth/resend-verification', {
          method: 'POST',
          credentials: 'include',
        });
        if (!verificationResponse.ok) {
          console.error('发送验证邮件失败: 接口返回非 200 状态');
        }
      } catch (verificationError) {
        console.error('发送验证邮件失败:', verificationError);
      }

      // 营销 opt-in（独立于账号验证）：勾选后单独写入 newsletter（SPEC 8.3）。
      // 失败不影响注册主流程，事务邮件不受订阅影响。
      if (values.marketingOptIn) {
        try {
          await fetch('/api/newsletter/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: values.email, source: 'signup' }),
          });
        } catch (newsletterError) {
          console.error('订阅营销邮件失败:', newsletterError);
        }
      }

      // 跳转到邮箱验证提示页面，而不是直接登录
      router.push(`/${locale}/check-email`);
    } catch {
      setError(t('errors.signupFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      setIsLoading(true);
      await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch {
      setError(t('errors.googleSignupFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <FormShell<SignupInput>
      form={form}
      title={t('title')}
      onSubmit={onSubmit}
      submitText={t('signUpButton')}
      submitLoadingText={t('signingUp')}
      isLoading={isLoading}
      error={error}
      footer={
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t('hasAccount')}{" "}
          <Link href={`/${locale}/login`} className="text-foreground hover:underline">
            {t('signInLink')}
          </Link>
        </p>
      }
      socialSlot={
        showGoogleAuth ? (
          <SocialAuthButtons onGoogleSignIn={handleGoogleSignIn} isLoading={isLoading} />
        ) : undefined
      }
    >
      <FormTextField
        control={form.control}
        name="name"
        label={t('nameLabel')}
        placeholder={t('namePlaceholder')}
        autoComplete="name"
      />
      <FormTextField
        control={form.control}
        name="email"
        type="email"
        label={t('emailLabel')}
        placeholder={t('emailPlaceholder')}
        autoComplete="email"
      />
      <FormTextField
        control={form.control}
        name="password"
        label={t('passwordLabel')}
        placeholder={t('passwordPlaceholder')}
        component={Password}
        autoComplete="new-password"
      />
      <label className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-border"
          {...form.register("marketingOptIn")}
        />
        <span>{t('marketingOptInLabel')}</span>
      </label>
    </FormShell>
  );
}
