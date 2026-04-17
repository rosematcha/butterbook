/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@butterbook/shared'],
  experimental: { typedRoutes: true },
};
export default nextConfig;
