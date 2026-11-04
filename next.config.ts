import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, so the app runs on any Node or
  // container host. Vercel ignores this setting.
  output: "standalone",
}

export default nextConfig
