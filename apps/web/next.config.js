/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  reactStrictMode: true,
  transpilePackages: ["ui", "types"],
};

module.exports = nextConfig;
