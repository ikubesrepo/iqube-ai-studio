import React from "react";
import * as Babel from "@babel/standalone";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// Defense in depth: even though the compiled component only ever receives a
// curated scope (React + a handful of Remotion primitives, no `require`,
// `fetch`, `document`, `window`, `process`, or filesystem access), reject
// generated code that contains any of these patterns before it's ever
// transpiled or executed. Checked both right after generation (server side,
// lib/dashboard/video-agent/illustration-codegen.ts) and again here at
// render time, in case stale/tampered data ever reaches this component.
const FORBIDDEN_PATTERNS = [
  /\bimport\b/,
  /\brequire\s*\(/,
  /\bexport\b/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bdocument\s*\./,
  /\bwindow\s*\./,
  /\bglobalThis\b/,
  /\bprocess\s*\./,
  /\b__dirname\b/,
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
];

export function isIllustrationCodeSafe(code: string): boolean {
  return !FORBIDDEN_PATTERNS.some((pattern) => pattern.test(code));
}

/**
 * Transpiles LLM-generated TSX (a single component named `Scene`, using
 * only the injected scope below) into a real React component function.
 * Returns null if the code is unsafe or fails to compile/construct --
 * callers should render a safe fallback rather than crash the whole video.
 */
export function compileIllustrationComponent(code: string): React.ComponentType | null {
  if (!code || !isIllustrationCodeSafe(code)) {
    return null;
  }

  try {
    const result = Babel.transform(code, {
      presets: ["react", "typescript"],
      filename: "scene.tsx",
    });

    const transformed = result?.code;

    if (!transformed) return null;

    const factory = new Function(
      "React",
      "useCurrentFrame",
      "useVideoConfig",
      "interpolate",
      "spring",
      "AbsoluteFill",
      `${transformed}\nreturn typeof Scene !== "undefined" ? Scene : null;`,
    );

    const Component = factory(React, useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill);
    return typeof Component === "function" ? Component : null;
  } catch {
    return null;
  }
}
