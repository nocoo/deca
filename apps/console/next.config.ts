import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  allowedDevOrigins: [
    "deca-console.dev.hexly.ai",
    "localhost:7011",
    "127.0.0.1:7011",
  ],
};

export default nextConfig;
