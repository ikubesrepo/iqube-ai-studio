import { OffthreadVideo } from "remotion";

/**
 * Full-frame during its Sequence window -- avatar clips take over the
 * entire scene for their short window rather than a small
 * picture-in-picture overlay, matching the "avatar clip placement" spec
 * (a short avatar-led moment, not a persistent corner overlay).
 *
 * `muted`: this clip's own embedded audio is intentionally silenced. Its
 * lips are driven by an exact slice of the single continuous narration
 * track (see generate-video-agent-scene.ts's extractAudioSlice usage),
 * which is the only audio that ever actually plays (VoiceoverAudio) --
 * playing the clip's own embedded copy of that same audio unmuted would
 * double it up.
 *
 * `OffthreadVideo` (not `<Video>`): `<Video>` relies on a live, native
 * `<video>` element's best-effort seeking in the Player (no frame-readiness
 * guarantee, which showed up as a brief black flash right as a Sequence
 * started) and on Chromium's native video/cache stack during server-side
 * rendering (which hit `net::ERR_CACHE_OPERATION_NOT_SUPPORTED` on long
 * signed CDN URLs -- a known Chromium disk-cache bug). OffthreadVideo
 * extracts frames through its own separate, frame-accurate mechanism in
 * both contexts, sidestepping both issues.
 */
export function AvatarClipLayer({ src }: { src: string }) {
  return <OffthreadVideo muted src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}
