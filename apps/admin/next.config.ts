import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/platform/:path*",
        destination: `${API_ORIGIN}/platform-admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
