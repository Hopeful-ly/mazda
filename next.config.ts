import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        // Apply CSP only to the reader route
        source: "/reader/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline'; object-src 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
