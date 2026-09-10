"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import type { AuthUiConfig, OAuthProvider, SignInState, SignUpState } from "@/lib/auth/types";
import { getAuthUiConfig } from "@/lib/auth/utils";
import { DEFAULT_AUTH_REDIRECT, getSafeRedirectPath, normalizeEmail, normalizeText } from "@/lib/auth/shared";
import { getInsforgeEnv } from "@/lib/insforge/env";
import { createInsforgeAuthActions, createInsforgeServerClient } from "@/lib/insforge/server";
import { recordUserLogin } from "@/lib/auth/record-login";

function validateEmail(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

function validatePassword(password: string, config: AuthUiConfig) {
  const errors: string[] = [];

  if (password.length < config.passwordMinLength) {
    errors.push(`Use at least ${config.passwordMinLength} characters.`);
  }

  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Add at least one lowercase letter.");
  }

  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Add at least one uppercase letter.");
  }

  if (config.requireNumber && !/\d/.test(password)) {
    errors.push("Add at least one number.");
  }

  if (config.requireSpecialChar && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("Add at least one special character.");
  }

  return errors;
}

function getReadableAuthError(message: string | undefined, fallback: string) {
  if (!message) {
    return fallback;
  }

  return message.replace(/^AUTH_/, "").replaceAll("_", " ");
}

function buildPostAuthUrl(pathname: string, nextPath: string) {
  const { appUrl } = getInsforgeEnv();
  const url = new URL(pathname, appUrl);

  if (nextPath && nextPath !== DEFAULT_AUTH_REDIRECT) {
    url.searchParams.set("next", nextPath);
  }

  return url.toString();
}

export async function signInAction(_: SignInState, formData: FormData): Promise<SignInState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");

  if (!email || !validateEmail(email)) {
    return {
      status: "error",
      errors: {
        email: ["Enter a valid email address."],
      },
    };
  }

  if (!password) {
    return {
      status: "error",
      errors: {
        password: ["Enter your password."],
      },
    };
  }

  const nextPath = getSafeRedirectPath(formData.get("next"));
  const auth = await createInsforgeAuthActions();
  const { data, error } = await auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.user) {
    return {
      status: "error",
      message: getReadableAuthError(error?.message, "Sign-in failed. Please check your details and try again."),
    };
  }

  await recordUserLogin({
    id: data.user.id,
    email: data.user.email,
    fullName: data.user.profile?.name ?? null,
    provider: "email",
  });

  redirect(nextPath);
}

export async function signUpAction(_: SignUpState, formData: FormData): Promise<SignUpState> {
  const config = await getAuthUiConfig();
  const name = normalizeText(formData.get("name"));
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  const nextPath = getSafeRedirectPath(formData.get("next"));

  const errors: NonNullable<SignUpState["errors"]> = {};

  if (!name || name.length < 2) {
    errors.name = ["Tell us what to call you."];
  }

  if (!email || !validateEmail(email)) {
    errors.email = ["Enter a valid email address."];
  }

  const passwordErrors = validatePassword(password, config);
  if (passwordErrors.length > 0) {
    errors.password = passwordErrors;
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      email,
      next: nextPath,
      errors,
    };
  }

  const auth = await createInsforgeAuthActions();
  const { data, error } = await auth.signUp({
    email,
    password,
    name,
    redirectTo: buildPostAuthUrl("/sign-in", nextPath),
  });

  if (error) {
    return {
      status: "error",
      email,
      next: nextPath,
      message: getReadableAuthError(error.message, "We could not create your account."),
    };
  }

  if (data?.requireEmailVerification) {
    return {
      status: config.verifyEmailMethod === "code" ? "verify" : "email-link",
      email,
      next: nextPath,
      message:
        config.verifyEmailMethod === "code"
          ? "Enter the six-digit code we sent to your inbox to finish setup."
          : "Check your inbox and open the verification link to activate your account.",
    };
  }

  if (data?.user) {
    await recordUserLogin({
      id: data.user.id,
      email: data.user.email,
      fullName: data.user.profile?.name ?? name,
      provider: "email",
    });
  }

  redirect(nextPath);
}

export async function verifyEmailAction(_: SignUpState, formData: FormData): Promise<SignUpState> {
  const email = normalizeEmail(formData.get("email"));
  const otp = normalizeText(formData.get('otp')).replace(/\s+/g, "");
  const nextPath = getSafeRedirectPath(formData.get("next"));

  if (!/^\d{6}$/.test(otp)) {
    return {
      status: "verify",
      email,
      next: nextPath,
      errors: {
        otp: ["Enter the six-digit code from your email."],
      },
    };
  }

  const auth = await createInsforgeAuthActions();
  const { data, error } = await auth.verifyEmail({
    email,
    otp,
  });

  if (error || !data?.user) {
    return {
      status: "verify",
      email,
      next: nextPath,
      message: getReadableAuthError(error?.message, "That verification code did not work. Request a new one and try again."),
    };
  }

  await recordUserLogin({
    id: data.user.id,
    email: data.user.email,
    fullName: data.user.profile?.name ?? null,
    provider: "email",
  });

  redirect(nextPath);
}

export async function resendVerificationAction(_: SignUpState, formData: FormData): Promise<SignUpState> {
  const config = await getAuthUiConfig();
  const email = normalizeEmail(formData.get("email"));
  const nextPath = getSafeRedirectPath(formData.get("next"));

  if (!email || !validateEmail(email)) {
    return {
      status: "error",
      errors: {
        email: ["Enter a valid email address before requesting another code."],
      },
    };
  }

  const client = await createInsforgeServerClient();
  const { error } = await client.auth.resendVerificationEmail({
    email,
    redirectTo: buildPostAuthUrl("/sign-in", nextPath),
  });

  if (error) {
    return {
      status: config.verifyEmailMethod === "code" ? "verify" : "email-link",
      email,
      next: nextPath,
      message: getReadableAuthError(error.message, "We could not resend the verification email."),
    };
  }

  return {
    status: config.verifyEmailMethod === "code" ? "verify" : "email-link",
    email,
    next: nextPath,
    message:
      config.verifyEmailMethod === "code"
        ? "A fresh verification code is on its way."
        : "We sent another verification link to your inbox.",
  };
}

export async function signOutAction() {
  const auth = await createInsforgeAuthActions();

  await auth.signOut();
  redirect("/sign-in");
}

export async function initiateOAuthAction(formData: FormData) {
  const provider = normalizeText(formData.get("provider")) as OAuthProvider;
  const nextPath = getSafeRedirectPath(formData.get("next"));
  const auth = await createInsforgeAuthActions();
  const cookieStore = await cookies();
  const redirectTo = buildPostAuthUrl("/api/auth/callback", nextPath);

  const { data, error } = await auth.signInWithOAuth(provider, {
    redirectTo,
    skipBrowserRedirect: true,
    additionalParams: provider === "google" ? { prompt: "select_account" } : undefined,
  });

  if (error || !data.url || !data.codeVerifier) {
    redirect("/sign-in?error=oauth_failed");
  }

  cookieStore.set("insforge_code_verifier", data.codeVerifier, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  cookieStore.set("insforge_oauth_provider", provider, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect(data.url);
}
