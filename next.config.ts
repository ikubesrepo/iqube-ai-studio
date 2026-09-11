import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Avatar uploads send the original image plus 16:9/9:16 crops in one
      // request; the framework default (1MB) is too small for real photos.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
