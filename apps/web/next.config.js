/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["ui", "types", "tailwindconfig", "tsconfig"],
};

module.exports = nextConfig;
