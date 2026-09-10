import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { getSafeRedirectPath } from "@/lib/auth/shared";
import { getAuthUiConfig, redirectIfAuthenticated } from "@/lib/auth/utils";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfAuthenticated();

  const [resolvedSearchParams, config] = await Promise.all([searchParams, getAuthUiConfig()]);
  const nextPath = getSafeRedirectPath(
    typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : undefined
  );

  return (
    <AuthShell
      badge="ONBOARD NEW TEAMS"
      description="Create a polished account flow with InsForge verification, social sign-in, responsive form states, and a theme that the rest of the product can keep building on."
      footer="The UI adapts to the backend auth configuration, so provider changes in InsForge stay reflected in the app."
      title="Launch a cleaner onboarding flow without sacrificing backend rigor."
    >
      <SignUpForm config={config} next={nextPath} />
    </AuthShell>
  );
}
