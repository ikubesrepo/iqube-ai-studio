import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Avatar uploads send the original image plus 16:9/9:16 crops in one
      // request; the framework default (1MB) is too small for real photos.
      bodySizeLimit: "20mb",
    },
  },
  // @remotion/bundler and @remotion/renderer drive headless Chromium and
  // are only ever imported from Trigger.dev task files -- never a client
  // or edge bundle. This is a defense-in-depth guard against them
  // accidentally being pulled into an app bundle.
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer"],
};

export default nextConfig;
