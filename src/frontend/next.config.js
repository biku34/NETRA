// This app is the Hotspots module of the Netra platform. The platform shell
// (../portal) proxies /hotspots on its own origin to this server.
const PORTAL_URL = process.env.NETRA_PORTAL_URL || "http://localhost:5173";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: "/hotspots",
  transpilePackages: [
    "@deck.gl/react",
    "@deck.gl/core",
    "@deck.gl/layers",
    "@deck.gl/geo-layers",
  ],
  async redirects() {
    // opened directly (not through the platform): send the visitor to the platform
    return [{ source: "/", destination: PORTAL_URL, basePath: false, permanent: false }];
  },
};

module.exports = nextConfig;
