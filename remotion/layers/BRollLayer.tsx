import { AbsoluteFill, Img, OffthreadVideo } from "remotion";

import type { SceneData } from "../types";
import { IllustrationLayer } from "./IllustrationLayer";

export function BRollLayer({ scene }: { scene: SceneData }) {
  if (scene.bRollType === "ai_illustration") {
    return <IllustrationLayer code={scene.illustrationCode} />;
  }

  if (!scene.bRollUrl) {
    return <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }} />;
  }

  if (scene.bRollType === "stock_video" || scene.bRollType === "ai_video") {
    return (
      <AbsoluteFill>
        {/* OffthreadVideo, not <Video> -- see AvatarClipLayer.tsx's comment:
            avoids both the Player's live-seek black-flash race and
            Chromium's native video/cache stack (which can throw
            net::ERR_CACHE_OPERATION_NOT_SUPPORTED on long signed CDN URLs
            during server-side rendering). */}
        <OffthreadVideo src={scene.bRollUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Img src={scene.bRollUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
}
