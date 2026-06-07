"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { FormShell } from "@/features/forms/components/form-shell";
import {
  FormTextareaField,
  FormTextField,
} from "@/features/forms/components/form-text-field";
import { ContactInput, contactSchema } from "@/features/marketing/schemas";

export function ContactForm() {
  const t = useTranslations("contact");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  async function onSubmit(values: ContactInput) {
    setSubmitState("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(
          (data as { error?: string }).error ??
            "Something went wrong. Please email support@sceneself.com directly.",
        );
        setSubmitState("error");
        return;
      }
      setSubmitState("success");
      form.reset();
    } catch {
      setErrorMessage("Network error. Please email support@sceneself.com directly.");
      setSubmitState("error");
    }
  }

  return (
    <FormShell<ContactInput>
      form={form}
      title={t("title")}
      description={t("description")}
      onSubmit={onSubmit}
      submitText={
        submitState === "submitting"
          ? t("form.submitting", { defaultValue: "Sending…" })
          : submitState === "success"
            ? t("form.sent", { defaultValue: "Sent — we'll reply within 24–48h" })
            : t("form.submitButton")
      }
      className="relative z-20"
      headerSlot={null}
      footer={
        errorMessage ? (
          <p className="pt-2 text-sm text-red-500">{errorMessage}</p>
        ) : submitState === "success" ? (
          <p className="pt-2 text-sm text-emerald-600">
            {t("form.successHint", {
              defaultValue: "Thanks — your message reached support@sceneself.com. We'll reply within 24–48 hours.",
            })}
          </p>
        ) : null
      }
    >
      <FormTextField
        control={form.control}
        name="name"
        label={t("form.nameLabel")}
        placeholder={t("form.namePlaceholder")}
        autoComplete="name"
      />
      <FormTextField
        control={form.control}
        name="email"
        type="email"
        label={t("form.emailLabel")}
        placeholder={t("form.emailPlaceholder")}
        autoComplete="email"
      />
      <FormTextareaField
        control={form.control}
        name="message"
        label={t("form.messageLabel")}
        placeholder={t("form.messagePlaceholder")}
        rows={5}
      />
    </FormShell>
  );
}
