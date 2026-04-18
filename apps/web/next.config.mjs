/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@butterbook/shared'],
  experimental: { typedRoutes: false },
};
export default nextConfig;
