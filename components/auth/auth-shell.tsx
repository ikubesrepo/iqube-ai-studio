import Link from "next/link";

import { cn } from "@/lib/utils";

type AuthShellProps = {
  badge: string;
  children: React.ReactNode;
  description: string;
  footer: React.ReactNode;
  title: string;
};

const highlights = [
  "Unified auth, storage, AI, and data in one backend",
  "Server-owned refresh tokens with SSR-safe session handling",
  "Responsive studio UI with shared design tokens",
];

export function AuthShell({ badge, children, description, footer, title }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(41,121,255,0.22),_transparent_26%),radial-gradient(circle_at_80%_18%,_rgba(23,201,161,0.18),_transparent_22%),linear-gradient(180deg,_var(--background),_color-mix(in_oklch,var(--background),white_26%))]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.35)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-foreground/75" href="/">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklch,var(--accent),white_12%))] text-sm font-bold text-primary-foreground shadow-[0_24px_60px_-26px_rgba(15,124,255,0.85)]">
              AI
            </span>
            STUDIO
          </Link>
          <nav className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link className="rounded-full px-4 py-2 transition hover:bg-white/60 hover:text-foreground" href="/sign-in">
              Sign in
            </Link>
            <Link className="rounded-full border border-border/70 bg-white/80 px-4 py-2 text-foreground shadow-[0_12px_32px_-24px_rgba(15,23,41,0.5)] backdrop-blur" href="/sign-up">
              Create account
            </Link>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="max-w-2xl">
            <span className="inline-flex rounded-full border border-white/80 bg-white/75 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-primary shadow-[0_18px_45px_-32px_rgba(15,124,255,0.9)] backdrop-blur">
              {badge}
            </span>
            <h1 className="mt-8 max-w-xl font-heading text-5xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-6xl">
              {title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              {description}
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {highlights.map((item, index) => (
                <div
                  className={cn(
                    "rounded-[calc(var(--radius)*1.7)] border border-white/80 bg-white/78 p-4 shadow-[0_28px_54px_-34px_rgba(15,23,41,0.45)] backdrop-blur",
                    index === 1 && "translate-y-4"
                  )}
                  key={item}
                >
                  <div className="mb-3 text-xs font-semibold tracking-[0.16em] text-primary/70">0{index + 1}</div>
                  <p className="text-sm leading-6 text-foreground/82">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[calc(var(--radius)*2.4)] border border-white/80 bg-white/82 p-3 shadow-[0_45px_100px_-48px_rgba(7,20,48,0.55)] backdrop-blur-xl">
            <div className="rounded-[calc(var(--radius)*2.1)] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,253,0.94))] p-7 shadow-inner">
              {children}
              <div className="mt-8 rounded-[calc(var(--radius)*1.5)] border border-border/70 bg-[linear-gradient(180deg,rgba(12,29,56,0.98),rgba(9,19,36,0.98))] p-5 text-slate-100 shadow-[0_30px_70px_-45px_rgba(10,20,35,0.9)]">
                <div className="text-xs font-semibold tracking-[0.18em] text-cyan-200/75">LIVE STUDIO PREVIEW</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1.3fr_0.7fr]">
                  <div className="rounded-[calc(var(--radius)*1.2)] border border-white/8 bg-white/6 p-4">
                    <div className="text-sm text-slate-300">Active workspaces</div>
                    <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">18</div>
                    <div className="mt-4 h-2 rounded-full bg-white/10">
                      <div className="h-2 w-3/4 rounded-full bg-[linear-gradient(90deg,#42a5ff,#37ddb1)]" />
                    </div>
                  </div>
                  <div className="rounded-[calc(var(--radius)*1.2)] border border-white/8 bg-white/6 p-4">
                    <div className="text-sm text-slate-300">Session uptime</div>
                    <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">99.9%</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="pb-2 text-sm text-muted-foreground">{footer}</footer>
      </div>
    </div>
  );
}
