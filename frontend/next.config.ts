import type { NextConfig } from "next";

/**
 * The Spring Boot backend has no CORS configuration (see backend/src/main/java/com/agentshield/security/SecurityConfig.java).
 * Rather than add CORS to the backend, every request to /api/v1/* is proxied server-side to
 * the real backend, so the browser only ever talks to this Next.js origin.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
