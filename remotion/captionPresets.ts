import type { CaptionStyleId } from "./types";

export type CaptionPreset = {
  id: CaptionStyleId;
  label: string;
  description: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  textColor: string;
  highlightColor: string;
  backgroundColor: string | null;
  uppercase: boolean;
};

/**
 * Pure data, no server-only imports -- consumed both by the Next UI picker
 * (components/dashboard/video-agent/caption-style-picker.tsx, imported via
 * the "@/remotion/captionPresets" alias) and by remotion/layers/CaptionLayer.tsx
 * (relative import, since @remotion/bundler's own webpack config drives that
 * file and may not resolve Next's path aliases).
 *
 * Every style renders the same way -- a sliding 3-word window with the
 * currently-spoken word highlighted -- these presets only control the
 * visual theme (font, color, background), not the word-grouping behavior.
 */
export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "bold_subtitle",
    label: "Bold Subtitle",
    description: "Large bold white text with a dark outline.",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 800,
    fontSize: 84,
    textColor: "#ffffff",
    highlightColor: "#ffd60a",
    backgroundColor: null,
    uppercase: false,
  },
  {
    id: "minimal_clean",
    label: "Minimal Clean",
    description: "Small, understated text for a professional look.",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 500,
    fontSize: 56,
    textColor: "#f5f5f5",
    highlightColor: "#93c5fd",
    backgroundColor: "rgba(0,0,0,0.35)",
    uppercase: false,
  },
  {
    id: "podcast",
    label: "Podcast",
    description: "Centered pill-style caption, like a talk-show lower third.",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 600,
    fontSize: 62,
    textColor: "#111111",
    highlightColor: "#2563eb",
    backgroundColor: "#ffffff",
    uppercase: false,
  },
  {
    id: "tiktok_viral",
    label: "TikTok Viral",
    description: "Punchy uppercase text with a bright highlight color.",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 900,
    fontSize: 92,
    textColor: "#ffffff",
    highlightColor: "#39ff14",
    backgroundColor: null,
    uppercase: true,
  },
  {
    id: "gradient_highlight",
    label: "Gradient Highlight",
    description: "Bold text with a colorful gradient highlight behind each word.",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 800,
    fontSize: 80,
    textColor: "#ffffff",
    highlightColor: "#a855f7",
    backgroundColor: null,
    uppercase: false,
  },
  {
    id: "word_by_word",
    label: "Word-by-Word Animated",
    description: "Words appear one at a time in sync with the voiceover.",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 800,
    fontSize: 84,
    textColor: "#ffffff",
    highlightColor: "#ffd60a",
    backgroundColor: null,
    uppercase: false,
  },
];

export function findCaptionPreset(id: string): CaptionPreset | null {
  return CAPTION_PRESETS.find((preset) => preset.id === id) ?? null;
}
