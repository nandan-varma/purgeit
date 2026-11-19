import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The repository root has its own lockfile; this app is self-contained.
  turbopack: { root: import.meta.dirname },
  // Every docs page is also served as Markdown (for people, tools and agents).
  async rewrites() {
    return [
      { source: '/docs/:path*.md', destination: '/llms.mdx/docs/:path*.md' },
      { source: '/docs/:path*.txt', destination: '/llms.mdx/docs/:path*.txt' },
    ];
  },
};

export default withMDX(config);
