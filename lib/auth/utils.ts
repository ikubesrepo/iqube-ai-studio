import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { DEFAULT_AUTH_REDIRECT } from "@/lib/auth/shared";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import type { AuthUiConfig } from "@/lib/auth/types";

export const getAuthUiConfig = cache(async (): Promise<AuthUiConfig> => {
  const client = await createInsforgeServerClient();
  const { data, error } = await client.auth.getPublicAuthConfig();

  if (error || !data) {
    throw new Error(error?.message || "Unable to load authentication settings.");
  }

  return {
    customOAuthProviders: data.customOAuthProviders,
    disableSignup: data.disableSignup,
    oAuthProviders: data.oAuthProviders,
    passwordMinLength: data.passwordMinLength,
    requireEmailVerification: data.requireEmailVerification,
    requireLowercase: data.requireLowercase,
    requireNumber: data.requireNumber,
    requireSpecialChar: data.requireSpecialChar,
    requireUppercase: data.requireUppercase,
    resetPasswordMethod: data.resetPasswordMethod,
    verifyEmailMethod: data.verifyEmailMethod,
  };
});

export const getCurrentUser = cache(async () => {
  const client = await createInsforgeServerClient();
  const { data } = await client.auth.getCurrentUser();

  return data?.user || null;
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in?next=/dashboard");
  }

  return user;
}

export async function redirectIfAuthenticated() {
  const user = await getCurrentUser();

  if (user) {
    redirect(DEFAULT_AUTH_REDIRECT);
  }
}
