import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 15 optimizations
  experimental: {
    // Enable React 19 concurrent features (may require canary)
    reactCompiler: true,
    // Optimize for better performance
    // optimizeCss: true,
    // PPR only available in canary versions
    // ppr: "incremental",
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
  
  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: true,
    dirs: ['src', 'app'],
  },
  
  // Headers for performance and Core Web Vitals
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
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
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
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
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
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/css/(.*)',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/css; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/videos/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000',
          },
          {
            key: 'Accept-Ranges',
            value: 'bytes',
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
    // Shader files loader
    config.module.rules.push({
      test: /\.(glsl|vert|frag)$/,
      type: 'asset/source',
    });
    
    // Skip polyfills for modern features
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Skip core-js polyfills for features available in modern browsers
        'core-js/modules/es.array.flat': false,
        'core-js/modules/es.array.flat-map': false,
        'core-js/modules/es.object.from-entries': false,
        'core-js/modules/es.string.trim-end': false,
        'core-js/modules/es.string.trim-start': false,
      };
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
      
      // Additional performance optimizations
      config.optimization.minimize = true;
      config.optimization.concatenateModules = true;
      
      // Module resolution optimizations
      config.resolve.alias = {
        ...config.resolve.alias,
        'react': 'react',
        'react-dom': 'react-dom'
      };
      
      // Performance budgets and code splitting
      config.performance = {
        maxAssetSize: 512000,
        maxEntrypointSize: 512000,
        hints: 'warning'
      };
    }


    return config;
  },
};

export default nextConfig;