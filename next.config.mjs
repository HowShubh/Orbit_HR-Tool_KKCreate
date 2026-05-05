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
  },
};

export default nextConfig;
