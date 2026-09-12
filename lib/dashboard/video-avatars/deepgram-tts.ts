import "server-only";

/**
 * Default voices are Deepgram Aura voices, so narrating a script in one of
 * them can go straight to Deepgram's TTS API instead of routing through
 * Replicate's Chatterbox (which is only needed to match an arbitrary
 * user-uploaded voice sample for cloned voices). This avoids Replicate
 * billing entirely for the default-voice path, and Deepgram already
 * returns mp3 directly, so no ffmpeg conversion step is needed either.
 */
export async function synthesizeDeepgramSpeech(voiceModelId: string, text: string): Promise<Buffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new Error("Deepgram is not configured yet.");
  }

  const response = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voiceModelId)}&encoding=mp3`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram speech synthesis failed: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
