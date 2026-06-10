/* eslint-disable react/no-unescaped-entities */
import { Metadata } from "next";
import { getTranslations } from 'next-intl/server';
import type { Locale } from "@/i18n.config";
import { ScenePageShell } from "@/components/scene-chrome/scene-page-shell";

export async function generateMetadata(
  props: {
    params: Promise<{ locale: Locale }>
  }
): Promise<Metadata> {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'seo' });

  return {
    title: t('terms.title'),
    description: t('terms.description'),
    openGraph: {
      images: [t('terms.ogImage')],
    },
  };
}

export default function TermsPage() {
  return (
    <ScenePageShell>
    <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="prose prose-invert max-w-none prose-headings:text-stone-50 prose-headings:tracking-tight prose-h1:font-medium prose-h1:italic prose-h2:text-amber-100 prose-a:text-amber-300 prose-a:no-underline hover:prose-a:underline prose-strong:text-amber-100 prose-li:marker:text-amber-300/60 prose-p:text-stone-300 prose-li:text-stone-300">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        
        <p className="text-muted-foreground mb-8">
          Effective Date: June 3, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p>
            Welcome to SceneSelf ("SceneSelf", "we", "our", or "us"). These Terms of Service ("Terms") govern your use of our website and services (collectively, the "Service") located at sceneself.com.
          </p>
          <p>
            By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of these terms, then you may not access the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Service Description</h2>
          <p>
            SceneSelf provides an AI service that creates imagined, creative photo sets from a selfie and a short scene description. Our Service allows you to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Generate a cohesive AI photo set from one selfie</li>
            <li>Choose creative scene types (travel, lifestyle, milestones, fantasy, seasonal)</li>
            <li>Start with a free 6-photo set and export for social media</li>
            <li>Credits, subscriptions, and account management</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
          <p>
            To access certain features of our Service, you may be required to create an account. When creating an account, you must:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide accurate, current, and complete information</li>
            <li>Maintain the security of your password and account</li>
            <li>Promptly update your account information to keep it accurate</li>
            <li>Accept all risks of unauthorized access to your account</li>
            <li>Be at least 18 years old or the age of legal consent in your jurisdiction</li>
          </ul>
          <p className="mt-4">
            You are responsible for all activities that occur under your account. We reserve the right to refuse service, terminate accounts, or remove content at our sole discretion.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
          <p>
            You agree not to use the Service to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Violate any laws or regulations</li>
            <li>Infringe upon the rights of others</li>
            <li>Upload or transmit viruses or malicious code</li>
            <li>Engage in any activity that disrupts or interferes with the Service</li>
            <li>Attempt to gain unauthorized access to any portion of the Service</li>
            <li>Harass, abuse, or harm another person</li>
            <li>Use the Service for any illegal or unauthorized purpose</li>
            <li>Violate any applicable laws in your jurisdiction</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Intellectual Property Rights</h2>
          <p>
            The Service and its original content, features, and functionality are and will remain the exclusive property of SceneSelf and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.
          </p>
          <p className="mt-4">
            You retain ownership of any content you submit to the Service. By submitting content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and distribute your content in connection with operating and providing the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Payment Terms</h2>
          <p>
            If you purchase any services from us, you agree to pay all applicable fees as described at the time of purchase. All payments are:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Processed through secure third-party payment providers</li>
            <li>Subject to the payment provider's terms and conditions</li>
            <li>Non-refundable except as required by law or as explicitly stated in our Refund Policy</li>
            <li>Subject to applicable taxes which you are responsible for</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Disclaimers and Limitations of Liability</h2>
          <p>
            THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
          <p className="mt-4">
            IN NO EVENT SHALL SceneSelf, ITS DIRECTORS, EMPLOYEES, PARTNERS, AGENTS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless SceneSelf and its affiliates from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees arising out of or relating to your violation of these Terms or your use of the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. Termination</h2>
          <p>
            We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
          </p>
          <p className="mt-4">
            Upon termination, your right to use the Service will immediately cease. All provisions of the Terms which by their nature should survive termination shall survive termination.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">10. Privacy Policy</h2>
          <p>
            Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy, which also governs the Site and informs users of our data collection practices.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">11. Changes to Terms</h2>
          <p>
            We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">12. Governing Law</h2>
          <p>
            These Terms shall be governed by the laws of the jurisdiction in which the independent developer operating SceneSelf is established, without regard to its conflict of law provisions. Any disputes will be resolved through good-faith communication first; users may reach the developer by the email below for any concern.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">13. Contact Information</h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <ul className="list-none space-y-2 mt-4">
            <li>Email: support@sceneself.com</li>
            <li>Website: https://sceneself.com</li>
            <li>Operated by: an independent developer (please reach us by email; typical response within 24–48 hours)</li>
          </ul>
        </section>
      </div>
    </div>
    </ScenePageShell>
  );
}
