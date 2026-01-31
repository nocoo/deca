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
    "https://deca-console.dev.hexly.ai",
    "https://deca-console.dev.hexly.ai:443",
    "http://deca-console.dev.hexly.ai",
    "http://localhost:7011",
    "http://127.0.0.1:7011",
  ],
};

export default nextConfig;
