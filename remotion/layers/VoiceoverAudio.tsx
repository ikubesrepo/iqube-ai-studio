import { Audio } from "remotion";

export function VoiceoverAudio({ src }: { src: string }) {
  return <Audio src={src} />;
}
