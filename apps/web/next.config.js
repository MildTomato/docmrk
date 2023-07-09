/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  reactStrictMode: true,
  transpilePackages: ["ui"],
}

module.exports = nextConfig
