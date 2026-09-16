import { Composition } from "remotion";

import { VideoAgentComposition } from "./VideoAgentComposition";
import type { VideoAgentCompositionProps } from "./types";

const DEFAULT_PROPS: VideoAgentCompositionProps = {
  aspectRatio: "16:9",
  durationInFrames: 30 * 30,
  fps: 30,
  width: 1920,
  height: 1080,
  narrationAudioUrl: "",
  captionStyle: "bold_subtitle",
  captions: [],
  scenes: [],
  transitionStyle: "crossfade",
};

export function RemotionRoot() {
  return (
    <Composition
      id="VideoAgentComposition"
      component={VideoAgentComposition}
      defaultProps={DEFAULT_PROPS}
      durationInFrames={DEFAULT_PROPS.durationInFrames}
      fps={DEFAULT_PROPS.fps}
      width={DEFAULT_PROPS.width}
      height={DEFAULT_PROPS.height}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.durationInFrames,
        fps: props.fps,
        width: props.width,
        height: props.height,
      })}
    />
  );
}
