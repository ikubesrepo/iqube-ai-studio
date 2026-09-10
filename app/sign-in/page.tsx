import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getAuthMessageFromSearchParams, getSafeRedirectPath } from "@/lib/auth/shared";
import { getAuthUiConfig, redirectIfAuthenticated } from "@/lib/auth/utils";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfAuthenticated();

  const [resolvedSearchParams, config] = await Promise.all([searchParams, getAuthUiConfig()]);
  const nextPath = getSafeRedirectPath(
    typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : undefined
  );
  const flashMessage = getAuthMessageFromSearchParams(resolvedSearchParams);

  return (
    <AuthShell
      badge="SECURE ACCESS"
      description="Server actions handle password auth, OAuth initiation, callback exchange, and refresh cookies so your studio experience stays smooth across real app routes."
      footer="Powered by InsForge SSR auth helpers, Next.js route handlers, and a shared studio design system."
      title="Sign in to the AI workspace your team actually wants to open."
    >
      <SignInForm config={config} flashMessage={flashMessage} next={nextPath} />
    </AuthShell>
  );
}
