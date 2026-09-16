import { useMemo } from "react";
import { AbsoluteFill } from "remotion";

import { compileIllustrationComponent } from "../dynamic-illustration";

/**
 * Renders a scene's AI-generated "illustration" b-roll style from real,
 * LLM-generated React/Remotion component source code (compiled at render
 * time -- see ../dynamic-illustration.ts) rather than a fixed shapes-JSON
 * interpreter. Falls back to a plain dark frame if the code is missing,
 * unsafe, or fails to compile, so one bad generation never crashes the
 * whole video.
 */
export function IllustrationLayer({ code }: { code: string | null | undefined }) {
  const Component = useMemo(() => (code ? compileIllustrationComponent(code) : null), [code]);

  if (!Component) {
    return <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }} />;
  }

  // Rendering a runtime-compiled component (identity stabilized above via
  // useMemo on `code`) is the standard pattern for LLM/user-generated code
  // previews (the same technique MDX, react-live, and Sandpack use) --
  // there's no static component to hoist since the component itself is the
  // dynamic part.
  // eslint-disable-next-line react-hooks/static-components
  return <Component />;
}
