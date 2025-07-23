import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 15 optimizations
  experimental: {
    // Enable React 19 concurrent features (may require canary)
    // reactCompiler: true,
    // Optimize for better performance
    // optimizeCss: true,
    // Enable partial prerendering (only available in canary)
    // ppr: true,
  },

  // Turbopack configuration (moved from experimental.turbo)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // Server external packages (moved from experimental.serverComponentsExternalPackages)
  serverExternalPackages: ['sharp'],

  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production',
    // Enable React optimizations
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },

  // Bundle optimization
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  
  // Advanced image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vibe-manager-media.s3.amazonaws.com',
        port: '',
        pathname: '/**',
      },
    ],
    // Enable modern image formats
    formats: ['image/webp', 'image/avif'],
    // Device size optimization
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Loader optimization
    loader: 'default',
    // Enable image optimization
    unoptimized: false,
  },

  // Performance optimizations
  poweredByHeader: false,
  generateEtags: false,
  compress: true,
  
  // Enable static optimization
  output: 'standalone',
  
  // Headers for performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/fonts/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/images/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },

  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Shader loaders
    config.module.rules.push({
      test: /\.(glsl|vert|frag)$/,
      use: ['raw-loader', 'glslify-loader'],
    });

    // Bundle analyzer (development only)
    if (dev && !isServer) {
      config.plugins.push(
        new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)({
          analyzerMode: 'disabled',
          generateStatsFile: true,
          statsOptions: { source: false },
        })
      );
    }

    // Optimize chunk splitting
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            reuseExistingChunk: true,
          },
          three: {
            test: /[\\/]node_modules[\\/](three|@react-three)[\\/]/,
            name: 'three',
            priority: 20,
            reuseExistingChunk: true,
          },
          common: {
            name: 'common',
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      };
    }

    // Tree shaking optimizations
    if (!dev) {
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
    }

    return config;
  },
};

export default nextConfig;