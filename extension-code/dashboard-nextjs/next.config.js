/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@clerk/nextjs'],
  // If you need to proxy API requests or configure other settings
  async rewrites() {
    return [
      // You can add API rewrites here if needed
    ];
  },
};

module.exports = nextConfig;

