/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  webpack: (config) => {
    // Solana web3 + spl-token need crypto polyfills in browser-side code
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, crypto: false };
    return config;
  },
};

export default nextConfig;
