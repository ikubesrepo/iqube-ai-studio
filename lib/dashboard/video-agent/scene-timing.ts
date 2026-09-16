import "server-only";

export type TimedWord = { word: string; start: number; end: number };

export type SceneTiming = { start_time: number; end_time: number };

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Scenes are planned by an LLM against the *script text* before any audio
 * exists, so their start_time/end_time are only estimates based on an
 * assumed speaking pace. Once the real voiceover is synthesized and
 * transcribed (Deepgram gives real word-level timestamps), this re-derives
 * each scene's actual timing by walking the same word count through the
 * real transcript, in script order -- since scenes are LLM-planned as
 * contiguous, non-overlapping chunks of the exact same script, and TTS
 * speaks that script in order, a simple word-count alignment (no fuzzy text
 * matching needed) accurately syncs visuals/avatar clips to what's actually
 * being said, at the cost of the true total video length drifting slightly
 * from the user's originally selected duration.
 */
export function realignSceneTiming(sceneSegments: string[], words: TimedWord[]): SceneTiming[] {
  if (words.length === 0) {
    // No transcript to align against -- keep zero-length placeholders
    // rather than fabricating timing; caller should treat this as a
    // failure case upstream (an empty voiceover is itself unexpected).
    return sceneSegments.map(() => ({ start_time: 0, end_time: 0 }));
  }

  let cursor = 0;
  let previousEnd = 0;

  return sceneSegments.map((segment, index) => {
    const wordCount = Math.max(1, countWords(segment));
    const sliceEnd = Math.min(cursor + wordCount, words.length);
    const sliceWords = words.slice(cursor, sliceEnd);

    // Stitch to the previous scene's end (0 for the first scene) instead of
    // the next word's raw Deepgram timestamp -- a natural pause between
    // words otherwise left a gap here, which rendered as black frames
    // between/before scenes in the composition. end_time still comes from
    // the real transcript, so audio/visual sync with the actual voiceover
    // is unchanged.
    const start = index === 0 ? 0 : previousEnd;
    const rawEnd = sliceWords.length > 0 ? sliceWords[sliceWords.length - 1].end : start;
    const end = Math.max(rawEnd, start + 0.1);

    cursor = sliceEnd;
    previousEnd = end;

    return { start_time: start, end_time: end };
  });
}
