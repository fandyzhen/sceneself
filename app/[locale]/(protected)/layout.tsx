import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { EmailVerifiedGuard } from "@/features/auth/components/email-verified-guard";
import { SceneNavBar } from "@/components/scene-chrome/scene-navbar";
import { SceneFooter } from "@/components/scene-chrome/scene-footer";
import { ScenePageShell } from "@/components/scene-chrome/scene-page-shell";
import { getActiveSessionUser } from "@/lib/auth/session";

export default async function ProtectedLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
  }
) {
  const params = await props.params;

  const {
    locale
  } = params;

  const {
    children
  } = props;

  const access = await getActiveSessionUser(await headers());
  if (!access.ok) {
    redirect(`/${locale}/login`);
  }

  return (
    <EmailVerifiedGuard requireEmailVerification={true}>
      <div className="dark min-h-screen bg-stone-950 text-stone-100">
        <SceneNavBar />
        <ScenePageShell glow={false}>
          <main>{children}</main>
        </ScenePageShell>
        <SceneFooter />
      </div>
    </EmailVerifiedGuard>
  );
}
