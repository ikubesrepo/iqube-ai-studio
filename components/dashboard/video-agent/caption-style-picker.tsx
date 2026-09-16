"use client";

import { CAPTION_PRESETS } from "@/remotion/captionPresets";
import type { CaptionStyleId } from "@/remotion/types";
import { cn } from "@/lib/utils";

export function CaptionStylePicker({
  value,
  onChange,
}: {
  value: CaptionStyleId;
  onChange: (value: CaptionStyleId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CAPTION_PRESETS.map((preset) => {
        const isSelected = preset.id === value;

        return (
          <button
            className={cn(
              "flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-all",
              isSelected ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/50",
            )}
            key={preset.id}
            onClick={() => onChange(preset.id)}
            type="button"
          >
            <div
              className="flex h-16 items-center justify-center bg-black px-2"
              style={{
                fontFamily: preset.fontFamily,
                fontWeight: preset.fontWeight,
                color: preset.textColor,
                fontSize: 14,
                backgroundColor: preset.backgroundColor ? "#111111" : "#000000",
              }}
            >
              <span
                style={{
                  padding: preset.backgroundColor ? "4px 10px" : 0,
                  borderRadius: 8,
                  backgroundColor: preset.backgroundColor ?? "transparent",
                  textTransform: preset.uppercase ? "uppercase" : "none",
                }}
              >
                Sample <span style={{ color: preset.highlightColor }}>this</span> text
              </span>
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-semibold text-foreground">{preset.label}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
