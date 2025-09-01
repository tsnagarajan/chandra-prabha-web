const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence workspace-root warning
  outputFileTracingRoot: path.join(__dirname),

  // Include ephemeris files with the chart API
  outputFileTracingIncludes: {
    'app/api/chart/route.ts': ['./ephe/**'],
  },

  // Skip ESLint and TypeScript errors during production build
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Keep native swisseph external to avoid bundling issues
      config.externals = config.externals || [];
      if (!config.externals.includes('swisseph')) {
        config.externals.push('swisseph');
      }
    }
    return config;
  },
};

module.exports = nextConfig;
