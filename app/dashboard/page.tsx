import Link from "next/link";
import { CpuIcon, Layers3Icon, LockKeyholeIcon, SparklesIcon } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthUiConfig, requireUser } from "@/lib/auth/utils";
import { cn } from "@/lib/utils";

const metrics = [
  {
    label: "Auth posture",
    value: "SSR",
    note: "Refresh token stays server-owned",
    icon: LockKeyholeIcon,
  },
  {
    label: "Studio pipelines",
    value: "12",
    note: "Pinned workspaces ready for orchestration",
    icon: Layers3Icon,
  },
  {
    label: "Agent capacity",
    value: "Live",
    note: "InsForge-backed workflows online",
    icon: CpuIcon,
  },
];

export default async function DashboardPage() {
  const [user, authConfig] = await Promise.all([requireUser(), getAuthUiConfig()]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(41,121,255,0.17),_transparent_24%),linear-gradient(180deg,var(--background),color-mix(in_oklch,var(--background),white_22%))] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[calc(var(--radius)*2.2)] border border-white/85 bg-white/80 p-5 shadow-[0_30px_80px_-42px_rgba(12,29,56,0.55)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-primary/75">AI STUDIO DASHBOARD</p>
              <h1 className="mt-3 font-heading text-4xl font-semibold tracking-[-0.04em] text-foreground">
                Welcome back, {user.profile?.name || user.email?.split("@")[0] || "creator"}.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                Your project is wired to InsForge auth with {authConfig.oAuthProviders.join(", ") || "email/password"} enabled. The sign-in flow is now ready for real app sessions instead of starter markup.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link className={cn(buttonVariants({ size: "lg", variant: "outline" }), "rounded-2xl")} href="/">
                View landing page
              </Link>
              <form action={signOutAction}>
                <Button className="rounded-2xl shadow-[0_24px_50px_-30px_rgba(15,124,255,0.8)]" size="lg" type="submit">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          {metrics.map((metric) => (
            <Card
              className="rounded-[calc(var(--radius)*1.8)] border border-white/80 bg-white/84 py-0 shadow-[0_28px_60px_-42px_rgba(12,29,56,0.5)]"
              key={metric.label}
            >
              <CardHeader className="px-6 pt-6">
                <div className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
                  <metric.icon className="size-5" />
                </div>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="text-3xl font-semibold tracking-[-0.04em]">{metric.value}</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6 text-sm text-muted-foreground">{metric.note}</CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-[calc(var(--radius)*1.9)] border border-white/80 bg-white/84 py-0 shadow-[0_28px_60px_-42px_rgba(12,29,56,0.5)]">
            <CardHeader className="px-6 pt-6">
              <CardDescription>What shipped</CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-[-0.04em]">Authentication now behaves like product code, not scaffolding.</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 px-6 pb-6 text-sm leading-7 text-muted-foreground">
              <div className="rounded-[calc(var(--radius)*1.2)] border border-border/70 bg-accent/40 p-4">
                Password sign-in, server-owned refresh, and OAuth callback exchange all run through Next.js route handlers and server actions.
              </div>
              <div className="rounded-[calc(var(--radius)*1.2)] border border-border/70 bg-accent/40 p-4">
                The sign-up page adapts to the project’s verification mode and provider list instead of hardcoding assumptions.
              </div>
              <div className="rounded-[calc(var(--radius)*1.2)] border border-border/70 bg-accent/40 p-4">
                Shared design tokens now power the landing page, auth surfaces, and dashboard for a tighter studio identity.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[calc(var(--radius)*1.9)] border border-white/80 bg-[linear-gradient(180deg,rgba(10,23,44,0.98),rgba(8,17,30,0.98))] py-0 text-slate-50 shadow-[0_35px_80px_-42px_rgba(5,13,28,0.8)]">
            <CardHeader className="px-6 pt-6">
              <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
                <SparklesIcon className="size-5" />
              </div>
              <CardDescription className="text-slate-300">Provider status</CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-[-0.04em] text-white">
                {authConfig.oAuthProviders.includes("x") ? "Google and X are available." : "Google is ready. X can be enabled later."}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 text-sm leading-7 text-slate-300">
              InsForge supports the `x` provider, but your linked backend currently exposes: {authConfig.oAuthProviders.join(", ") || "no social providers"}.
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
