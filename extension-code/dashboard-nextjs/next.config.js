/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@clerk/nextjs', '@clerk/shared', '@clerk/backend'],
  // Mark Node.js-only packages as external to prevent bundling issues
  serverExternalPackages: ['pdf-parse', 'mammoth'],
  experimental: {
    // Allow dynamic code evaluation for Clerk in Edge middleware
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // If you need to proxy API requests or configure other settings
  async rewrites() {
    return [
      // You can add API rewrites here if needed
    ];
  },
};

module.exports = nextConfig;

