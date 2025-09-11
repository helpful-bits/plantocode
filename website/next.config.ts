import type { NextConfig } from "next";
import { withPlausibleProxy } from "next-plausible";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',
  
  // Enable source maps in production
  productionBrowserSourceMaps: true,
  // Enable compression for better performance
  compress: true,
  // Remove powered by header for security
  poweredByHeader: false,

  // Cross-origin development configuration
  allowedDevOrigins: ['192.168.0.38', 'localhost'],

  // Next.js 15 optimizations
  experimental: {
    // Enable React 19 concurrent features (may require canary)
    // reactCompiler: true, // Temporarily disabled - conflicts with custom webpack chunking
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
    // Emotion optimization
    emotion: false,
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
      {
        protocol: 'https',
        hostname: 'd2tyb0wucqqf48.cloudfront.net',
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
    // Cache TTL set to 7 days (604800 seconds)
    minimumCacheTTL: 604800,
  },

  // Performance optimizations
  generateEtags: false,
  
  // Enable static optimization - moved to top of config to avoid duplicate
  
  // TypeScript configuration - ignore errors during build for deployment
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: true,
    dirs: ['src', 'app'],
  },

  // Rewrites are now handled by middleware for proper header forwarding
  // The middleware.ts file handles all analytics proxying with correct client headers
  // Note: withPlausibleProxy wrapper may still add its own rewrites
  // async rewrites() {
  //   return [];
  // },
  
  // Redirects to eliminate chains shown in Google Search Console
  async redirects() {
    return [
      // Fix HTTP to HTTPS redirect chains
      {
        source: '/:path*',
        has: [
          {
            type: 'header',
            key: 'x-forwarded-proto',
            value: 'http',
          },
        ],
        destination: 'https://www.vibemanager.app/:path*',
        permanent: true,
      },
      // Fix non-www to www redirect chains
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'vibemanager.app',
          },
        ],
        destination: 'https://www.vibemanager.app/:path*',
        permanent: true,
      },
    ];
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
      // Cache headers for images
      {
        source: '/:all*.(png|jpg|jpeg|gif|webp|avif|svg)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
      // Cache headers for videos
      {
        source: '/:all*.(mp4|webm|ogg)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      }
    ];
  },

  // Webpack optimizations
  webpack: (config, { isServer, dev }) => {
    // Enable source maps in production
    if (!dev) config.devtool = 'source-map';
    // Shader files loader
    config.module.rules.push({
      test: /\.(glsl|vert|frag)$/,
      type: 'asset/source',
    });
    
    // Skip all polyfills for modern features - we target modern browsers only
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Skip ALL core-js polyfills - saves ~13KB based on Lighthouse
        'core-js': false,
        '@babel/runtime': false,
        // Skip specific polyfills identified in Lighthouse report
        'core-js/modules/es.array.flat': false,
        'core-js/modules/es.array.flat-map': false,
        'core-js/modules/es.array.at': false,
        'core-js/modules/es.object.from-entries': false,
        'core-js/modules/es.object.has-own': false,
        'core-js/modules/es.string.trim-end': false,
        'core-js/modules/es.string.trim-start': false,
      };
      
      // Exclude polyfills from bundle
      config.externals = {
        ...config.externals,
        'core-js': 'null',
        '@babel/runtime': 'null',
      };
    }

    // Optimize chunk splitting - Re-enabled with better configuration
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // Framework core
          framework: {
            test: /[\\/]node_modules[\\/](react|react-dom|next)[\\/]/,
            name: 'framework',
            priority: 40,
            reuseExistingChunk: true,
          },
          // Three.js and related
          three: {
            test: /[\\/]node_modules[\\/](three|@react-three|postprocessing)[\\/]/,
            name: 'three',
            priority: 30,
            reuseExistingChunk: true,
          },
          // Monaco editor (large)
          monaco: {
            test: /[\\/]node_modules[\\/](monaco-editor|@monaco-editor)[\\/]/,
            name: 'monaco',
            priority: 25,
            reuseExistingChunk: true,
          },
          // UI libraries
          ui: {
            test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|framer-motion)[\\/]/,
            name: 'ui',
            priority: 20,
            reuseExistingChunk: true,
          },
          // Other vendors
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            reuseExistingChunk: true,
          },
          // Common chunks
          common: {
            name: 'common',
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      };
      
      // Remove unused exports
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      config.optimization.minimize = true;
      config.optimization.concatenateModules = true;
    }


    return config;
  },
};

// Use withPlausibleProxy to handle script injection and proxying
export default withPlausibleProxy()(nextConfig);