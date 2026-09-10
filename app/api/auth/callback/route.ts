import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createAuthActions, createServerClient } from "@insforge/sdk/ssr";

import { getSafeRedirectPath } from "@/lib/auth/shared";
import { getInsforgeEnv } from "@/lib/insforge/env";
import { recordUserLogin, type LoginProvider } from "@/lib/auth/record-login";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("insforge_code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const nextPath = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));

  if (oauthError || !code) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_failed", request.url));
  }

  const { baseUrl, anonKey } = getInsforgeEnv();
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("insforge_code_verifier")?.value;
  const provider = cookieStore.get("insforge_oauth_provider")?.value as LoginProvider | undefined;

  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_verifier", request.url));
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const auth = createAuthActions({
    baseUrl,
    anonKey,
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier);

  if (error || !data?.user) {
    return NextResponse.redirect(new URL("/sign-in?error=exchange_failed", request.url));
  }

  // request.cookies is a pre-login snapshot; response.cookies has the session
  // exchangeOAuthCode just wrote. Read response first, falling back to request.
  const dbClient = createServerClient({
    baseUrl,
    anonKey,
    cookies: {
      get: (name: string) => response.cookies.get(name) ?? request.cookies.get(name),
    },
  });

  await recordUserLogin({
    client: dbClient,
    id: data.user.id,
    email: data.user.email,
    fullName: data.user.profile?.name ?? null,
    provider: provider ?? data.user.providers?.[0] ?? "oauth",
  });

  response.cookies.delete("insforge_code_verifier");
  response.cookies.delete("insforge_oauth_provider");

  return response;
}
