import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { findCaptionPreset } from "../captionPresets";
import type { CaptionCue, CaptionStyleId, CaptionWord } from "../types";

const WORDS_PER_GROUP = 3;

function flattenWords(captions: CaptionCue[]): CaptionWord[] {
  return captions.flatMap((cue) =>
    cue.words && cue.words.length > 0 ? cue.words : [{ word: cue.text, start: cue.start, end: cue.end }],
  );
}

export function CaptionLayer({ captions, captionStyle }: { captions: CaptionCue[]; captionStyle: CaptionStyleId }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const preset = findCaptionPreset(captionStyle);

  // Full, flattened word list across every caption cue (from the Deepgram
  // transcription stored in captions_data) so the 3-word window can slide
  // across cue boundaries rather than resetting at each cue.
  const words = useMemo(() => flattenWords(captions), [captions]);

  if (!preset || words.length === 0) return null;

  let activeIndex = -1;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) {
      activeIndex = i;
    } else {
      break;
    }
  }

  if (activeIndex === -1) return null;
  if (time > words[words.length - 1].end + 1) return null;

  const groupStart = Math.floor(activeIndex / WORDS_PER_GROUP) * WORDS_PER_GROUP;
  const groupWords = words.slice(groupStart, groupStart + WORDS_PER_GROUP);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90 }}>
      <div
        style={{
          maxWidth: "90%",
          padding: preset.backgroundColor ? "14px 32px" : 0,
          borderRadius: 18,
          backgroundColor: preset.backgroundColor ?? "transparent",
          fontFamily: preset.fontFamily,
          fontWeight: preset.fontWeight,
          fontSize: preset.fontSize,
          color: preset.textColor,
          textAlign: "center",
          textShadow: preset.backgroundColor ? "none" : "0 3px 16px rgba(0,0,0,0.75)",
          lineHeight: 1.2,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {groupWords.map((word, index) => {
          const isActive = groupStart + index === activeIndex;
          const text = preset.uppercase ? word.word.toUpperCase() : word.word;

          return (
            <span key={groupStart + index} style={{ color: isActive ? preset.highlightColor : preset.textColor }}>
              {text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
