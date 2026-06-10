import type { NextConfig } from 'next';

// The marketing site is fully static (no data fetching, no server runtime), so the default
// Next build prerenders every route at build time. Kept deliberately minimal; deploys as its
// own Vercel project with Root Directory = apps/web.
const nextConfig: NextConfig = {};

export default nextConfig;
