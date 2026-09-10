"use client";

import Link from "next/link";
import { useState, useActionState } from "react";

import { resendVerificationAction, signUpAction, verifyEmailAction } from "@/app/actions/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { AuthUiConfig, SignUpState } from "@/lib/auth/types";
import { DEFAULT_AUTH_REDIRECT, getPasswordRequirements } from "@/lib/auth/shared";

const initialSignUpState: SignUpState = {
  status: "idle",
};

export function SignUpForm({
  config,
  next,
}: {
  config: AuthUiConfig;
  next: string;
}) {
  const [signUpState, signUpActionFn] = useActionState(signUpAction, initialSignUpState);
  const [verifyState, verifyActionFn] = useActionState(verifyEmailAction, initialSignUpState);
  const [resendState, resendActionFn] = useActionState(resendVerificationAction, initialSignUpState);
  const [otp, setOtp] = useState("");

  const effectiveState = verifyState.status !== "idle" ? verifyState : resendState.status !== "idle" ? resendState : signUpState;
  const shouldVerify = effectiveState.status === "verify";
  const shouldCheckInbox = effectiveState.status === "email-link";
  const email = effectiveState.email || "";
  const passwordRequirements = getPasswordRequirements(config);

  if (config.disableSignup) {
    return (
      <div className="space-y-4">
        <h2 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">Sign-up is currently closed</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          This InsForge project is not accepting new accounts right now. Use sign-in instead or reopen signup in backend auth settings.
        </p>
        <Link className="text-sm font-medium text-foreground underline decoration-primary/35 underline-offset-4" href="/sign-in">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">
          {shouldVerify || shouldCheckInbox ? "Finish your setup" : "Create your studio account"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {shouldVerify
            ? `We sent a verification code to ${email}.`
            : shouldCheckInbox
              ? `Open the verification link we sent to ${email}.`
              : "Start with email and password, then InsForge will complete verification with the project’s configured flow."}
        </p>
      </div>

      {effectiveState.message ? (
        <div
          className={`rounded-[calc(var(--radius)*1.25)] px-4 py-3 text-sm ${
            effectiveState.status === "error"
              ? "border border-destructive/20 bg-destructive/8 text-destructive"
              : "border border-primary/20 bg-primary/8 text-foreground"
          }`}
        >
          {effectiveState.message}
        </div>
      ) : null}

      {shouldVerify ? (
        <div className="space-y-4">
          <form action={verifyActionFn} className="space-y-5">
            <input name="email" type="hidden" value={email} />
            <input name="next" type="hidden" value={effectiveState.next || next} />
            <input name="otp" type="hidden" value={otp} />

            <Field>
              <FieldLabel htmlFor="otp-code">Verification code</FieldLabel>
              <FieldContent>
                <InputOTP
                  id="otp-code"
                  maxLength={6}
                  onChange={setOtp}
                  pattern="\d*"
                  value={otp}
                >
                  <InputOTPGroup className="gap-2 rounded-none bg-transparent">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot
                        className="size-12 rounded-2xl border border-border/80 bg-white shadow-[0_10px_22px_-18px_rgba(12,29,56,0.45)] first:rounded-2xl first:border last:rounded-2xl last:border"
                        index={index}
                        key={index}
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <FieldError>{effectiveState.errors?.otp?.[0]}</FieldError>
              </FieldContent>
            </Field>

            <SubmitButton className="h-12 w-full rounded-2xl shadow-[0_24px_50px_-30px_rgba(15,124,255,0.8)]" pendingLabel="Verifying code">
              Verify and open studio
            </SubmitButton>
          </form>
          <form action={resendActionFn}>
            <input name="email" type="hidden" value={email} />
            <input name="next" type="hidden" value={effectiveState.next || next} />
            <SubmitButton className="h-11 w-full rounded-2xl" pendingLabel="Sending another code" variant="outline">
              Send another code
            </SubmitButton>
          </form>
        </div>
      ) : shouldCheckInbox ? (
        <div className="space-y-4">
          <div className="rounded-[calc(var(--radius)*1.4)] border border-border/80 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(12,29,56,0.45)]">
            <p className="text-sm leading-6 text-muted-foreground">
              Once the verification link is confirmed, come back here and sign in with your email and password.
            </p>
          </div>
          <form action={resendActionFn}>
            <input name="email" type="hidden" value={email} />
            <input name="next" type="hidden" value={effectiveState.next || next} />
            <SubmitButton className="h-11 w-full rounded-2xl" pendingLabel="Sending another link" variant="outline">
              Resend verification email
            </SubmitButton>
          </form>
        </div>
      ) : (
        <>
          <form action={signUpActionFn} className="space-y-5">
            <input name="next" type="hidden" value={next} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="sign-up-name">Name</FieldLabel>
                <FieldContent>
                  <Input
                    autoComplete="name"
                    className="h-12 rounded-2xl border-border/80 bg-white shadow-[0_10px_22px_-18px_rgba(12,29,56,0.45)]"
                    id="sign-up-name"
                    name="name"
                    placeholder="Ada Lovelace"
                    type="text"
                  />
                  <FieldError>{signUpState.errors?.name?.[0]}</FieldError>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="sign-up-email">Email</FieldLabel>
                <FieldContent>
                  <Input
                    autoComplete="email"
                    className="h-12 rounded-2xl border-border/80 bg-white shadow-[0_10px_22px_-18px_rgba(12,29,56,0.45)]"
                    id="sign-up-email"
                    name="email"
                    placeholder="you@aistudio.com"
                    type="email"
                  />
                  <FieldError>{signUpState.errors?.email?.[0]}</FieldError>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="sign-up-password">Password</FieldLabel>
                <FieldContent>
                  <Input
                    autoComplete="new-password"
                    className="h-12 rounded-2xl border-border/80 bg-white shadow-[0_10px_22px_-18px_rgba(12,29,56,0.45)]"
                    id="sign-up-password"
                    name="password"
                    placeholder="Create a secure password"
                    type="password"
                  />
                  <FieldError>{signUpState.errors?.password?.[0]}</FieldError>
                </FieldContent>
              </Field>
            </FieldGroup>

            <div className="rounded-[calc(var(--radius)*1.4)] border border-border/70 bg-accent/45 p-4">
              <p className="text-xs font-semibold tracking-[0.16em] text-primary/70">PASSWORD RULES</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {passwordRequirements.map((item) => (
                  <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs text-foreground/78" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <SubmitButton className="h-12 w-full rounded-2xl shadow-[0_24px_50px_-30px_rgba(15,124,255,0.8)]" pendingLabel="Creating account">
              Create account
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
              X sign-up can be enabled later. This project currently exposes Google as its active social login.
            </p>
          ) : null}
        </>
      )}

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-foreground underline decoration-primary/35 underline-offset-4" href={`/sign-in${next !== DEFAULT_AUTH_REDIRECT ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
