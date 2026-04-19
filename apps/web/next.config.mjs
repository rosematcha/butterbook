/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: ['@butterbook/shared'],
  experimental: { typedRoutes: false },
};
export default nextConfig;
