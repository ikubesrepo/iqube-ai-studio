"use client";

import { initiateOAuthAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import type { OAuthProvider } from "@/lib/auth/types";

import { ProviderMark } from "@/components/auth/provider-button";

const providerLabels: Record<OAuthProvider, string> = {
  apple: "Apple",
  discord: "Discord",
  facebook: "Facebook",
  github: "GitHub",
  google: "Google",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  microsoft: "Microsoft",
  spotify: "Spotify",
  tiktok: "TikTok",
  x: "X",
};

export function OAuthButtons({
  next,
  providers,
}: {
  next: string;
  providers: OAuthProvider[];
}) {
  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {providers.map((provider) => (
        <form action={initiateOAuthAction} key={provider}>
          <input name="provider" type="hidden" value={provider} />
          <input name="next" type="hidden" value={next} />
          <Button className="h-11 w-full rounded-2xl border-border/80 bg-white text-foreground shadow-[0_12px_24px_-20px_rgba(15,23,41,0.45)] hover:bg-accent/50" size="lg" type="submit" variant="outline">
            <ProviderMark provider={provider} />
            Continue with {providerLabels[provider]}
          </Button>
        </form>
      ))}
    </div>
  );
}
