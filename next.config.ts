import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    // Note: Turbopack will be disabled via CLI flag instead of config
    // to avoid Adobe SDK log4js compatibility issues in development
  },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
    ],
  },
  // Webpack configuration for Adobe SDK compatibility
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Adobe SDK compatibility fixes
    if (isServer) {
      // Handle log4js dynamic imports that cause issues with Turbopack
      config.externals = config.externals || [];
      config.externals.push({
        // Mark log4js as external for server builds to avoid bundling issues
        'log4js': 'commonjs log4js',
      });

      // Configure module resolution for Adobe SDK dependencies
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Ensure proper fallbacks for Node.js modules used by Adobe SDK
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        buffer: false,
      };
    }

    // Handle dynamic imports for Adobe SDK
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    
    // Add rule to handle .cjs files properly
    config.module.rules.push({
      test: /\.cjs$/,
      type: 'javascript/auto',
    });

    // Ignore dynamic import warnings from log4js
    config.ignoreWarnings = config.ignoreWarnings || [];
    config.ignoreWarnings.push({
      module: /log4js/,
      message: /dynamic import/,
    });

    return config;
  },
};

export default nextConfig;

// end of file