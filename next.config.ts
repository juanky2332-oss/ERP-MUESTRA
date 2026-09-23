import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  experimental: {
    // Logos, albaranes/partes firmados y tickets se suben por server actions:
    // el límite por defecto (1 MB) cortaba fotos normales de móvil.
    serverActions: { bodySizeLimit: '4mb' },
  },

};

export default nextConfig;
