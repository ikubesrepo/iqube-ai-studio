import Link from "next/link";
import { ArrowRightIcon, BotIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/utils";
import { cn } from "@/lib/utils";

const featureCards = [
  {
    title: "Backend-authored access",
    body: "InsForge handles email auth, OAuth, secure refresh, and route-safe sessions without custom token plumbing.",
    icon: ShieldCheckIcon,
  },
  {
    title: "Premium studio shell",
    body: "A stronger token system now drives landing, auth, and dashboard surfaces with one consistent look and feel.",
    icon: SparklesIcon,
  },
  {
    title: "Operator-ready workspace",
    body: "The dashboard is ready for next backend tasks instead of shipping as a placeholder starter screen.",
    icon: BotIcon,
  },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(41,121,255,0.22),_transparent_22%),radial-gradient(circle_at_88%_12%,_rgba(23,201,161,0.18),_transparent_22%),linear-gradient(180deg,var(--background),color-mix(in_oklch,var(--background),white_18%))]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.32)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.32)_1px,transparent_1px)] bg-[size:74px_74px] opacity-40" />
      <div className="relative mx-auto max-w-7xl px-6 py-8 lg:px-10">
        <header className="flex flex-col gap-5 rounded-[calc(var(--radius)*2.4)] border border-white/85 bg-white/72 p-5 shadow-[0_34px_80px_-48px_rgba(10,20,40,0.55)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-primary/75">AI STUDIO SAAS</p>
            <h1 className="mt-3 font-heading text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
              Build AI products with a frontend that finally matches the backend ambition.
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-2xl px-5 shadow-[0_26px_56px_-34px_rgba(15,124,255,0.8)]"
              )}
              href={user ? "/dashboard" : "/sign-up"}
            >
              {user ? "Open dashboard" : "Start free"}
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 rounded-2xl px-5")}
              href="/sign-in"
            >
              {user ? "Switch account" : "Sign in"}
            </Link>
          </div>
        </header>

        <main className="grid items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <section>
            <div className="inline-flex rounded-full border border-white/85 bg-white/74 px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-primary shadow-[0_20px_40px_-32px_rgba(15,124,255,0.9)] backdrop-blur">
              DRIBBBLE-INSPIRED, BUT SHIPPABLE
            </div>
            <h2 className="mt-7 max-w-3xl font-heading text-5xl font-semibold tracking-[-0.055em] text-balance text-foreground sm:text-7xl">
              Auth, AI, and product operations in one calm control room.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              The studio now ships with InsForge-powered authentication, polished onboarding, and an interface system built to scale across future product surfaces.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-full border border-white/85 bg-white/80 px-4 py-2 text-sm text-foreground/80">Google OAuth live</span>
              <span className="rounded-full border border-white/85 bg-white/80 px-4 py-2 text-sm text-foreground/80">SSR auth refresh route</span>
              <span className="rounded-full border border-white/85 bg-white/80 px-4 py-2 text-sm text-foreground/80">Responsive sign-in and sign-up</span>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {featureCards.map((card) => (
                <div
                  className="rounded-[calc(var(--radius)*1.7)] border border-white/85 bg-white/78 p-5 shadow-[0_28px_56px_-40px_rgba(12,29,56,0.45)] backdrop-blur"
                  key={card.title}
                >
                  <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-accent text-primary">
                    <card.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[calc(var(--radius)*2.5)] border border-white/85 bg-white/82 p-4 shadow-[0_45px_100px_-52px_rgba(10,20,40,0.55)] backdrop-blur">
            <div className="rounded-[calc(var(--radius)*2.1)] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,247,252,0.96))] p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-primary/70">STUDIO SNAPSHOT</div>
                  <div className="mt-2 font-heading text-2xl font-semibold tracking-[-0.04em] text-foreground">Creative ops with reliable auth at the edge of the workflow.</div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-white px-4 py-3 text-right shadow-[0_18px_36px_-28px_rgba(12,29,56,0.45)]">
                  <div className="text-xs text-muted-foreground">Session health</div>
                  <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-foreground">99.9%</div>
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                <div className="rounded-[calc(var(--radius)*1.5)] border border-border/70 bg-[linear-gradient(135deg,rgba(9,22,41,0.98),rgba(7,17,30,0.98))] p-5 text-white shadow-[0_28px_70px_-40px_rgba(8,17,30,0.9)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-slate-300">Active AI sessions</div>
                      <div className="mt-2 text-4xl font-semibold tracking-[-0.05em]">24</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-cyan-200">InsForge live</div>
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-white/10">
                    <div className="h-2 w-4/5 rounded-full bg-[linear-gradient(90deg,#42a5ff,#2dd2bf)]" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[calc(var(--radius)*1.4)] border border-border/70 bg-white p-5 shadow-[0_20px_40px_-30px_rgba(12,29,56,0.35)]">
                    <div className="text-sm text-muted-foreground">Onboarding conversion</div>
                    <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">+18%</div>
                  </div>
                  <div className="rounded-[calc(var(--radius)*1.4)] border border-border/70 bg-white p-5 shadow-[0_20px_40px_-30px_rgba(12,29,56,0.35)]">
                    <div className="text-sm text-muted-foreground">OAuth providers</div>
                    <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">Dynamic</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
