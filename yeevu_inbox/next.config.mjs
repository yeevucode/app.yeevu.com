/** @type {import('next').NextConfig} */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();

const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
