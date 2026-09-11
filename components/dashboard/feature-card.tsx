import Link from "next/link";

import type { DashboardFeature } from "@/lib/dashboard/nav-config";
import { cn } from "@/lib/utils";

type FeatureCardProps = {
  feature: DashboardFeature;
  className?: string;
};

export function FeatureCard({ feature, className }: FeatureCardProps) {
  return (
    <Link
      className={cn(
        "group relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-[calc(var(--radius)*1.8)] p-6 text-white shadow-[0_28px_60px_-42px_rgba(12,29,56,0.5)] transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_35px_80px_-42px_rgba(12,29,56,0.65)]",
        className,
      )}
      href={feature.href}
    >
      {feature.media.type === "video" ? (
        <video
          autoPlay
          className="absolute inset-0 -z-10 size-full object-cover"
          loop
          muted
          playsInline
          preload="metadata"
          src={feature.media.src}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full object-cover" src={feature.media.src} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10 transition-colors duration-200 group-hover:from-black/90" />
      <div className="relative z-10">
        <div className="mb-4 inline-flex size-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
          <feature.icon className="size-5" />
        </div>
        <h3 className="font-heading text-xl font-semibold tracking-[-0.03em]">{feature.label}</h3>
        <p className="mt-1.5 max-w-[85%] text-sm leading-6 text-white/80">{feature.description}</p>
      </div>
    </Link>
  );
}
