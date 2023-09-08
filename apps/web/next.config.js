/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  reactStrictMode: true,
  transpilePackages: ["ui", "types", "tailwindconfig", "tsconfig"],
};

module.exports = nextConfig;
