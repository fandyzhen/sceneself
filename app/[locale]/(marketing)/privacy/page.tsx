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
    title: t('privacy.title'),
    description: t('privacy.description'),
    openGraph: {
      images: [t('privacy.ogImage')],
    },
  };
}

export default function PrivacyPage() {
  return (
    <ScenePageShell>
    <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="prose prose-invert max-w-none prose-headings:text-stone-50 prose-headings:tracking-tight prose-h1:font-medium prose-h1:italic prose-h2:text-amber-100 prose-a:text-amber-300 prose-a:no-underline hover:prose-a:underline prose-strong:text-amber-100 prose-li:marker:text-amber-300/60 prose-p:text-stone-300 prose-li:text-stone-300">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        
        <p className="text-muted-foreground mb-8">
          Effective Date: June 3, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p>
            SceneSelf ("SceneSelf", "we", "our", or "us") is committed to protecting your privacy. SceneSelf lets you create imagined, creative AI photo sets from a selfie and a short scene description. This Privacy Policy explains how we collect, use, disclose, and safeguard your information — including your selfie and facial data — when you use our website and services at sceneself.com.
          </p>
          <p>
            Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
          
          <h3 className="text-xl font-semibold mb-3">Personal Information</h3>
          <p>We may collect personal information that you provide directly to us, such as:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Name and contact information (email address, phone number)</li>
            <li>Account credentials (username, password)</li>
            <li>Payment information (processed through secure third-party providers)</li>
            <li>Profile information (avatar, preferences)</li>
            <li>Communications with us (support tickets, emails)</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-4">Automatically Collected Information</h3>
          <p>When you visit our Service, we automatically collect certain information, including:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Device information (IP address, browser type, operating system)</li>
            <li>Usage data (pages visited, time spent, clicks)</li>
            <li>Cookies and similar tracking technologies</li>
            <li>Log data (access times, referring URLs)</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-4">Information from Third-Party Services</h3>
          <p>If you authenticate using OAuth providers (Google, etc.), we may receive:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Basic profile information (name, email, profile picture)</li>
            <li>Authentication tokens</li>
            <li>Any additional information you authorize</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-4">Selfies, Face &amp; Biometric Data</h3>
          <p>
            SceneSelf creates AI photo sets from a selfie you upload. We treat your selfie and any facial features derived from it as sensitive data:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Purpose limitation.</strong> Your selfie is used only to generate the scene set you request and to verify that the results look like you (identity and quality checks) — not for any other purpose.</li>
            <li><strong>No training, no retained face templates.</strong> We do not use your selfie to train AI models, and we do not keep reusable facial-recognition templates or biometric identifiers beyond what is needed to complete your generation.</li>
            <li><strong>Automatic deletion.</strong> Your original selfie and any derived identity reference are deleted automatically once your scene set is delivered, and within 24 hours at the latest. You can also delete them at any time from your account.</li>
            <li><strong>Processing partners.</strong> Generation and visual quality/identity checks run via OpenRouter (Google Gemini models); generated images are stored on Cloudflare R2. Your selfie is shared with these providers solely to perform these operations.</li>
            <li><strong>BIPA &amp; GDPR.</strong> Where applicable (e.g., Illinois BIPA, EU/UK GDPR), we obtain your consent before processing biometric or face data, limit retention as above, and honor your access and deletion rights. We never sell biometric data.</li>
          </ul>
          <p className="mt-4">
            By uploading a selfie you consent to this processing. SceneSelf creates imagined, creative scenes — not proof of real events, ownership, or identity, and not impersonations of real people.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide, operate, and maintain our Service</li>
            <li>Process transactions and manage your account</li>
            <li>Send administrative information and updates</li>
            <li>Respond to your comments, questions, and support requests</li>
            <li>Improve and personalize your experience</li>
            <li>Monitor and analyze usage patterns and trends</li>
            <li>Develop new products, services, and features</li>
            <li>Prevent fraud and enhance security</li>
            <li>Comply with legal obligations</li>
            <li>Send marketing communications (with your consent)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. How We Share Your Information</h2>
          <p>We may share your information in the following situations:</p>
          
          <h3 className="text-xl font-semibold mb-3">With Service Providers</h3>
          <p>We share information with third-party vendors who perform services on our behalf, such as:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>AI processing: OpenRouter (Google Gemini models) for scene generation and visual quality/identity checks</li>
            <li>Image storage &amp; delivery: Cloudflare R2</li>
            <li>Payment processing: Creem</li>
            <li>Email delivery: Resend</li>
            <li>Cloud hosting and analytics providers</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-4">For Legal Purposes</h3>
          <p>We may disclose your information when required by law or to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Comply with legal obligations</li>
            <li>Respond to lawful requests from public authorities</li>
            <li>Protect our rights, privacy, safety, or property</li>
            <li>Enforce our terms and agreements</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-4">Business Transfers</h3>
          <p>
            In the event of a merger, acquisition, reorganization, or sale of assets, your information may be transferred as part of that transaction.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-4">With Your Consent</h3>
          <p>
            We may share your information for any other purpose with your explicit consent.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to protect your personal information, including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Encryption of data in transit (SSL/TLS)</li>
            <li>Encryption of sensitive data at rest</li>
            <li>Regular security audits and assessments</li>
            <li>Access controls and authentication requirements</li>
            <li>Employee training on data protection</li>
            <li>Incident response procedures</li>
          </ul>
          <p className="mt-4">
            However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your personal information, we cannot guarantee absolute security.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
          <p>
            We retain your personal information for as long as necessary to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide our services to you</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes and enforce agreements</li>
            <li>Maintain business records</li>
          </ul>
          <p className="mt-4">
            When we no longer need your information, we will securely delete or anonymize it in accordance with our data retention policies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Your Rights and Choices</h2>
          <p>Depending on your location, you may have the following rights regarding your personal information:</p>
          
          <h3 className="text-xl font-semibold mb-3">Access and Portability</h3>
          <p>You can request access to your personal information and receive a copy in a structured, machine-readable format.</p>

          <h3 className="text-xl font-semibold mb-3 mt-4">Correction and Update</h3>
          <p>You can request that we correct or update inaccurate or incomplete personal information.</p>

          <h3 className="text-xl font-semibold mb-3 mt-4">Deletion</h3>
          <p>You can request deletion of your personal information, subject to certain exceptions.</p>

          <h3 className="text-xl font-semibold mb-3 mt-4">Objection and Restriction</h3>
          <p>You can object to or request that we restrict processing of your personal information.</p>

          <h3 className="text-xl font-semibold mb-3 mt-4">Marketing Communications</h3>
          <p>You can opt-out of marketing emails by clicking the unsubscribe link or contacting us directly.</p>

          <h3 className="text-xl font-semibold mb-3 mt-4">Cookies</h3>
          <p>You can manage cookie preferences through your browser settings. See our Cookie Policy for more information.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. International Data Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries other than your country of residence. These countries may have different data protection laws than your country.
          </p>
          <p className="mt-4">
            We take appropriate safeguards to ensure that your personal information remains protected in accordance with this Privacy Policy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. California Privacy Rights (CCPA)</h2>
          <p>
            If you are a California resident, you have specific rights under the California Consumer Privacy Act (CCPA), including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>The right to know what personal information we collect, use, and disclose</li>
            <li>The right to request deletion of your personal information</li>
            <li>The right to opt-out of the sale of personal information (we do not sell personal information)</li>
            <li>The right to non-discrimination for exercising your privacy rights</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">10. European Privacy Rights (GDPR)</h2>
          <p>
            If you are located in the European Economic Area (EEA) or United Kingdom, you have additional rights under the General Data Protection Regulation (GDPR), including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>The right to be informed about data processing</li>
            <li>The right to rectification of inaccurate data</li>
            <li>The right to erasure ("right to be forgotten")</li>
            <li>The right to data portability</li>
            <li>The right to object to processing</li>
            <li>Rights related to automated decision-making</li>
            <li>The right to lodge a complaint with supervisory authorities</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">11. Children's Privacy</h2>
          <p>
            Our Service is not intended for children under 18 years of age. We do not knowingly collect personal information from children under 18. If you become aware that a child has provided us with personal information, please contact us immediately.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">12. Changes to This Privacy Policy</h2>
          <p>
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" at the top.
          </p>
          <p className="mt-4">
            For significant changes, we will provide additional notice through email or a prominent notice on our Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
          <p>
            If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:
          </p>
          <ul className="list-none space-y-2 mt-4">
            <li>Email: support@sceneself.com</li>
            <li>Support: support@sceneself.com</li>
            <li>Website: https://sceneself.com</li>
          </ul>
          <p className="mt-4">
            SceneSelf is an independent service operated by a solo developer. For privacy, data-deletion, or any other requests, the fastest way to reach us is by email at support@sceneself.com. We typically respond within 24–48 hours.
          </p>
        </section>
      </div>
    </div>
    </ScenePageShell>
  );
}
