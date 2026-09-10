"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInAction } from "@/app/actions/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEFAULT_AUTH_REDIRECT } from "@/lib/auth/shared";
import type { AuthUiConfig, SignInState } from "@/lib/auth/types";

const initialSignInState: SignInState = {
  status: "idle",
};

export function SignInForm({
  config,
  flashMessage,
  next,
}: {
  config: AuthUiConfig;
  flashMessage: string | null;
  next: string;
}) {
  const [state, formAction] = useActionState(signInAction, initialSignInState);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">Welcome back</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Sign in with email or use one of the live OAuth providers enabled in InsForge.
        </p>
      </div>

      {flashMessage ? (
        <div className="rounded-[calc(var(--radius)*1.25)] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-foreground">
          {flashMessage}
        </div>
      ) : null}

      {state.message ? (
        <div className="rounded-[calc(var(--radius)*1.25)] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      <form action={formAction} className="space-y-5">
        <input name="next" type="hidden" value={next} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
            <FieldContent>
              <Input
                autoComplete="email"
                className="h-12 rounded-2xl border-border/80 bg-white shadow-[0_10px_22px_-18px_rgba(12,29,56,0.45)]"
                defaultValue=""
                id="sign-in-email"
                name="email"
                placeholder="you@aistudio.com"
                type="email"
              />
              <FieldError>{state.errors?.email?.[0]}</FieldError>
            </FieldContent>
          </Field>

          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
              {config.resetPasswordMethod ? (
                <span className="text-xs text-muted-foreground">Reset flow available through InsForge {config.resetPasswordMethod} mode</span>
              ) : null}
            </div>
            <FieldContent>
              <Input
                autoComplete="current-password"
                className="h-12 rounded-2xl border-border/80 bg-white shadow-[0_10px_22px_-18px_rgba(12,29,56,0.45)]"
                id="sign-in-password"
                name="password"
                placeholder="Enter your password"
                type="password"
              />
              <FieldError>{state.errors?.password?.[0]}</FieldError>
            </FieldContent>
          </Field>
        </FieldGroup>

        <SubmitButton className="h-12 w-full rounded-2xl shadow-[0_24px_50px_-30px_rgba(15,124,255,0.8)]" pendingLabel="Signing you in">
          Open studio
        </SubmitButton>
      </form>

      <div className="relative py-1 text-center text-sm text-muted-foreground">
        <span className="relative z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,253,0.94))] px-3">
          Or continue with
        </span>
        <div className="absolute inset-x-0 top-1/2 border-t border-border/70" />
      </div>

      <OAuthButtons next={next} providers={config.oAuthProviders} />

      {!config.oAuthProviders.includes("x") ? (
        <p className="text-xs leading-5 text-muted-foreground">
          X sign-in is supported by InsForge, but it is not currently enabled on this project yet.
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link className="font-medium text-foreground underline decoration-primary/35 underline-offset-4" href={`/sign-up${next !== DEFAULT_AUTH_REDIRECT ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Create your account
        </Link>
      </p>
    </div>
  );
}
