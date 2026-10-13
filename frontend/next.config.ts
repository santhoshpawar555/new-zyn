const BACKEND_URL = process.env.BACKEND_URL;

const nextConfig = {
  async rewrites() {
    if (!BACKEND_URL) {
      throw new Error("BACKEND_URL environment variable is missing");
    }

    return [
      {
        source: "/api/zynora/:path*",
        destination: `${BACKEND_URL}/api/zynora/:path*`,
      },
      {
        source: "/api/admin/knowledge/:path*",
        destination: `${BACKEND_URL}/api/admin/knowledge/:path*`,
      },
      {
        source: "/api/conversations/:path*",
        destination: `${BACKEND_URL}/api/conversations/:path*`,
      },
      {
        source: "/api/conversations",
        destination: `${BACKEND_URL}/api/conversations`,
      },
      {
        source: "/api/monitoring/:path*",
        destination: `${BACKEND_URL}/api/monitoring/:path*`,
      },
    ];
  },
};

export default nextConfig;