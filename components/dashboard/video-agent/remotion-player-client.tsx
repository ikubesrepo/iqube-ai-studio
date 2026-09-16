"use client";

import { Player } from "@remotion/player";

import { VideoAgentComposition } from "@/remotion/VideoAgentComposition";
import type { VideoAgentCompositionProps } from "@/remotion/types";

/**
 * Thin "use client" wrapper around @remotion/player's <Player>, per Next's
 * own guidance for third-party client-only UI -- lets Server Components
 * still import the module containing this component without erroring,
 * while @remotion/player's browser-only code only ever loads client-side.
 */
export function RemotionPlayerClient({ compositionData }: { compositionData: VideoAgentCompositionProps }) {
  return (
    <Player
      component={VideoAgentComposition}
      compositionHeight={compositionData.height}
      compositionWidth={compositionData.width}
      controls
      durationInFrames={compositionData.durationInFrames}
      fps={compositionData.fps}
      inputProps={compositionData}
      style={{ width: "100%", aspectRatio: `${compositionData.width} / ${compositionData.height}` }}
    />
  );
}
