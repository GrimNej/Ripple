import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: false,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
