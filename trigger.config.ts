import { defineConfig } from "@trigger.dev/sdk";
import { ffmpeg, aptGet } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_jkcjbdhulorqcbwpoxel",
  runtime: "node-24",
  logLevel: "log",
  build: {
    extensions: [
      ffmpeg(),
      // @remotion/renderer drives a headless Chromium instance to render
      // video-agent compositions to MP4. Chromium's own binary is fetched
      // by Remotion itself at task runtime (ensureBrowser()), but it still
      // needs these shared libraries present on the box -- this is
      // Remotion's own documented Docker dependency list
      // (remotion.dev/docs/docker) for a minimal Debian/Ubuntu base image.
      //
      // Tried switching this to Trigger.dev's playwright() build extension
      // (pre-installs Chromium at build time, avoiding a runtime download
      // in production) but it fails to bundle on trigger.dev CLI 4.6.0:
      // playwright-core's own bundle has unresolvable conditional requires
      // for optional WebDriver BiDi support (chromium-bidi/lib/cjs/...)
      // that esbuild can't statically resolve, and marking those paths
      // external in this config's `external` array doesn't help since
      // they're pulled in by the extension's own build step, not by our
      // code. Reverted rather than risk breaking local dev over a
      // production-only optimization -- revisit with a future trigger.dev
      // CLI version, or handle it via a custom Dockerfile deploy instead.
      aptGet({
        packages: [
          "libnss3",
          "libdbus-1-3",
          "libatk1.0-0",
          "libgbm-dev",
          "libasound2",
          "libxrandr2",
          "libxkbcommon-dev",
          "libxfixes3",
          "libxcomposite1",
          "libxdamage1",
          "libatk-bridge2.0-0",
          "libpango-1.0-0",
          "libcairo2",
          "libcups2",
        ],
      }),
    ],
    // @remotion/bundler ships its own bundler (rspack) that Trigger.dev's
    // own build step (also rspack-based) cannot statically re-bundle
    // without colliding (observed: "Assignment to constant variable" from
    // @rspack/binding being required twice within the same bundling pass).
    // Marking these external keeps them as real runtime `require()` calls
    // against node_modules instead of being inlined by the build.
    // playwright-core is dynamically imported in lib/dashboard/video-agent/render.ts
    // (only reached if PLAYWRIGHT_BROWSERS_PATH is set) -- esbuild still
    // tries to statically bundle a dynamic import by default, which pulls
    // in playwright-core's own unresolvable conditional BiDi requires.
    // Marking it external leaves it as a real runtime import instead.
    external: ["@remotion/bundler", "@remotion/renderer", "@rspack/core", "@rspack/binding", "playwright-core"],
  },
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
});
