/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export for Cloudflare Pages — all our routes are "use client" so
  // no SSR is needed. Drops the need for OpenNext or Workers runtime.
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, crypto: false };
    return config;
  },
};

export default nextConfig;
