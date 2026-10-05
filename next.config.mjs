import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  serverExternalPackages: ["@titanexchange/sdk-ts"],
  // Wormhole Connect ships browser-only wallet/SDK code; transpile for Next 15.
  transpilePackages: ["@wormhole-foundation/wormhole-connect"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.externals.push("pino-pretty", "encoding");
    return config;
  },
};

export default nextConfig;
