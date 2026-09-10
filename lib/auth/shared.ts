import type { AuthUiConfig } from "@/lib/auth/types";

export const DEFAULT_AUTH_REDIRECT = "/dashboard";

export function getSafeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT
) {
  const candidate = typeof value === "string" ? value : value?.toString() || "";

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  return candidate;
}

export function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

export function getPasswordRequirements(config: AuthUiConfig) {
  const requirements = [`At least ${config.passwordMinLength} characters`];

  if (config.requireLowercase) {
    requirements.push("One lowercase letter");
  }

  if (config.requireUppercase) {
    requirements.push("One uppercase letter");
  }

  if (config.requireNumber) {
    requirements.push("One number");
  }

  if (config.requireSpecialChar) {
    requirements.push("One special character");
  }

  return requirements;
}

export function getAuthMessageFromSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  const status = typeof searchParams.insforge_status === "string" ? searchParams.insforge_status : undefined;
  const type = typeof searchParams.insforge_type === "string" ? searchParams.insforge_type : undefined;
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined;

  if (status === "success" && type === "verify_email") {
    return "Email verified. Sign in to open your studio.";
  }

  if (error === "oauth_failed") {
    return "We could not start OAuth for this provider. Try again in a moment.";
  }

  if (error === "missing_verifier") {
    return "The secure OAuth handshake expired. Start the sign-in flow again.";
  }

  if (error === "exchange_failed") {
    return "We received the provider response, but could not finish sign-in. Please retry.";
  }

  return null;
}
