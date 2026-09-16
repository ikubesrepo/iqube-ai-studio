"use client";

import { FilmIcon, ImageIcon, SparklesIcon, WandIcon } from "lucide-react";

import { B_ROLL_STYLES, B_ROLL_STYLE_INFO, type BRollStyle } from "@/lib/dashboard/video-agent/pricing";
import { cn } from "@/lib/utils";

const ICONS: Record<BRollStyle, typeof ImageIcon> = {
  ai_image: ImageIcon,
  stock: FilmIcon,
  ai_video: SparklesIcon,
  ai_illustration: WandIcon,
};

export function BRollStylePicker({ value, onChange }: { value: BRollStyle; onChange: (value: BRollStyle) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {B_ROLL_STYLES.map((style) => {
        const info = B_ROLL_STYLE_INFO[style];
        const Icon = ICONS[style];
        const isSelected = style === value;

        return (
          <button
            className={cn(
              "flex items-start gap-3 rounded-xl border-2 bg-card p-3 text-left transition-all",
              isSelected ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/50",
            )}
            key={style}
            onClick={() => onChange(style)}
            type="button"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{info.label}</p>
              <p className="text-xs text-muted-foreground">{info.description}</p>
              <p className="mt-1 text-xs font-medium text-foreground">
                {info.creditsPerScene === 0 ? "Free" : `${info.creditsPerScene} credits / scene`}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
