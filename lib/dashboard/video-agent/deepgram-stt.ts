import "server-only";

export type CaptionWord = { word: string; start: number; end: number };
export type CaptionCue = { text: string; start: number; end: number; words?: CaptionWord[] };

const WORDS_PER_FALLBACK_CUE = 8;

function groupWordsIntoCues(words: CaptionWord[]): CaptionCue[] {
  const cues: CaptionCue[] = [];

  for (let i = 0; i < words.length; i += WORDS_PER_FALLBACK_CUE) {
    const group = words.slice(i, i + WORDS_PER_FALLBACK_CUE);
    if (group.length === 0) continue;

    cues.push({
      text: group.map((word) => word.word).join(" "),
      start: group[0].start,
      end: group[group.length - 1].end,
      words: group,
    });
  }

  return cues;
}

/**
 * First speech-to-text usage in this repo (existing Deepgram usage is only
 * Aura text-to-speech). Transcribes the full narration audio with
 * word-level timestamps so captions stay in sync with the voiceover.
 */
export async function transcribeWithTimestamps(audioBuffer: Buffer, mimeType = "audio/mpeg"): Promise<CaptionCue[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new Error("Deepgram is not configured yet.");
  }

  const params = new URLSearchParams({
    model: "nova-2",
    punctuate: "true",
    utterances: "true",
    words: "true",
    smart_format: "true",
  });

  const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(audioBuffer),
  });

  if (!response.ok) {
    throw new Error(`Deepgram transcription failed: ${response.status}`);
  }

  const body = await response.json();
  const alternative = body?.results?.channels?.[0]?.alternatives?.[0];
  const words: CaptionWord[] = (alternative?.words ?? []).map((word: { punctuated_word?: string; word: string; start: number; end: number }) => ({
    word: word.punctuated_word ?? word.word,
    start: word.start,
    end: word.end,
  }));

  const utterances = body?.results?.utterances as
    | Array<{ transcript: string; start: number; end: number; words?: Array<{ punctuated_word?: string; word: string; start: number; end: number }> }>
    | undefined;

  if (utterances && utterances.length > 0) {
    return utterances.map((utterance) => ({
      text: utterance.transcript,
      start: utterance.start,
      end: utterance.end,
      words: (utterance.words ?? []).map((word) => ({
        word: word.punctuated_word ?? word.word,
        start: word.start,
        end: word.end,
      })),
    }));
  }

  return groupWordsIntoCues(words);
}
