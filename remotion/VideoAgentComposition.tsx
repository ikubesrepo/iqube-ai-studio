import { useEffect } from "react";
import { AbsoluteFill, Easing } from "remotion";
import { preloadAudio, preloadImage, preloadVideo } from "@remotion/preload";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import { AvatarClipLayer } from "./layers/AvatarClipLayer";
import { BRollLayer } from "./layers/BRollLayer";
import { CaptionLayer } from "./layers/CaptionLayer";
import { VoiceoverAudio } from "./layers/VoiceoverAudio";
import { AVATAR_CLIP_SECONDS, type SceneData, type TransitionStyleId, type VideoAgentCompositionProps } from "./types";

// ~333ms at 30fps -- a short, unobtrusive crossfade rather than a hard cut.
const FADE_FRAMES = 10;

type VisualSegment =
  | { kind: "transition" }
  | { kind: "avatar"; key: string; durationInFrames: number; scene: SceneData }
  | { kind: "broll"; key: string; durationInFrames: number; scene: SceneData };

/**
 * The Player renders scenes in real time as playback reaches them -- unlike
 * the server-side renderer (which uses delayRender()/continueRender() under
 * the hood via Remotion's own <Img>/<Video> and waits for every frame), live
 * playback has no such guarantee, so a scene's image/video can show a blank
 * flash while it's still loading right as its Sequence starts. Preloading
 * every scene's assets as soon as the composition mounts lets the browser
 * cache them ahead of time so each Sequence transition is instant.
 */
function usePreloadAssets({ narrationAudioUrl, scenes }: Pick<VideoAgentCompositionProps, "narrationAudioUrl" | "scenes">) {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (narrationAudioUrl) {
      cleanups.push(preloadAudio(narrationAudioUrl));
    }

    for (const scene of scenes) {
      if (scene.avatarClipUrl) {
        cleanups.push(preloadVideo(scene.avatarClipUrl));
      }

      if (scene.bRollUrl) {
        if (scene.bRollType === "stock_video" || scene.bRollType === "ai_video") {
          cleanups.push(preloadVideo(scene.bRollUrl));
        } else {
          cleanups.push(preloadImage(scene.bRollUrl));
        }
      }
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [narrationAudioUrl, scenes]);
}

/**
 * Builds the flat list of visual segments (avatar/B-roll sequences and the
 * transitions between them) for the TransitionSeries. Kept as plain data
 * (not JSX) so the trailing-overlap duration fixup below is a simple field
 * mutation on a plain object, not on a React element's props.
 */
function buildVisualSegments(
  scenes: SceneData[],
  fps: number,
  transitionStyle: TransitionStyleId,
): { segments: VisualSegment[]; totalOverlapFrames: number } {
  const segments: VisualSegment[] = [];
  let totalOverlapFrames = 0;
  const useCrossfade = transitionStyle === "crossfade";

  scenes.forEach((scene, sceneIdx) => {
    const sceneSeconds = scene.endTime - scene.startTime;
    const durationInFrames = Math.max(1, Math.round(sceneSeconds * fps));

    if (sceneIdx > 0 && useCrossfade) {
      segments.push({ kind: "transition" });
      totalOverlapFrames += FADE_FRAMES;
    }

    if (scene.hasAvatarClip && scene.avatarClipUrl) {
      const avatarClipSeconds = scene.avatarClipDurationSeconds ?? AVATAR_CLIP_SECONDS;
      const avatarFrames = Math.max(1, Math.round(Math.min(avatarClipSeconds, sceneSeconds) * fps));
      const remainderFrames = durationInFrames - avatarFrames;

      segments.push({ kind: "avatar", key: `${scene.id}-avatar`, durationInFrames: avatarFrames, scene });

      if (remainderFrames > FADE_FRAMES && useCrossfade) {
        segments.push({ kind: "transition" });
        totalOverlapFrames += FADE_FRAMES;
        segments.push({ kind: "broll", key: `${scene.id}-broll`, durationInFrames: remainderFrames, scene });
      } else if (remainderFrames > 0) {
        // Too short to fit a fade cleanly -- keep a hard cut rather than an
        // overlap larger than the remainder itself.
        segments.push({ kind: "broll", key: `${scene.id}-broll`, durationInFrames: remainderFrames, scene });
      }
    } else {
      segments.push({ kind: "broll", key: `${scene.id}-broll`, durationInFrames, scene });
    }
  });

  // TransitionSeries overlaps consume frames from adjacent sequences rather
  // than adding extra frames, so the visual track's total length shrinks by
  // totalOverlapFrames relative to the composition's true duration (driven
  // independently by composition-builder.ts from the real audio/caption
  // timing). Pad the last sequence so the visual track's end still lines up
  // with the composition's true end.
  if (totalOverlapFrames > 0) {
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];
      if (segment.kind !== "transition") {
        segment.durationInFrames += totalOverlapFrames;
        break;
      }
    }
  }

  return { segments, totalOverlapFrames };
}

export function VideoAgentComposition({
  fps,
  narrationAudioUrl,
  captionStyle,
  captions,
  scenes,
  transitionStyle,
}: VideoAgentCompositionProps) {
  usePreloadAssets({ narrationAudioUrl, scenes });

  // The audio track and captions are NOT part of the TransitionSeries below
  // -- they play as one continuous, unmodified track driven by the real
  // startTime/endTime values, exactly as before. Only the VISUAL layer
  // (avatar clips + B-roll) is wrapped in a TransitionSeries for crossfades,
  // so the crossfade change can never desync caption/audio timing.
  const { segments } = buildVisualSegments(scenes, fps, transitionStyle);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <TransitionSeries>
        {segments.map((segment, index) => {
          if (segment.kind === "transition") {
            return (
              <TransitionSeries.Transition
                key={`transition-${index}`}
                presentation={fade()}
                timing={linearTiming({ durationInFrames: FADE_FRAMES, easing: Easing.inOut(Easing.ease) })}
              />
            );
          }

          return (
            <TransitionSeries.Sequence durationInFrames={segment.durationInFrames} key={segment.key}>
              {segment.kind === "avatar" ? (
                <AvatarClipLayer src={segment.scene.avatarClipUrl!} />
              ) : (
                <BRollLayer scene={segment.scene} />
              )}
            </TransitionSeries.Sequence>
          );
        })}
      </TransitionSeries>

      <VoiceoverAudio src={narrationAudioUrl} />
      <CaptionLayer captionStyle={captionStyle} captions={captions} />
    </AbsoluteFill>
  );
}
