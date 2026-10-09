/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  experimental: {
    // Disable the client-side Router Cache for dynamic pages so navigation
    // never serves a stale snapshot. Each navigation triggers a fresh RSC fetch.
    // (Static pages keep their default cache window.)
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
    serverActions: {
      // Lockup's "Snap & extract" posts up to 8 photos as base64 data URLs, and
      // each downscaled shot is a few hundred KB once encoded. The 1MB default
      // rejected anything past the first photo before the action even ran.
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
