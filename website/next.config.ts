import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Disable trailing slashes to prevent redirect chains
  trailingSlash: false,

  // Enable source maps in production
  productionBrowserSourceMaps: true,
  // Enable compression for better performance
  compress: true,
  // Remove powered by header for security
  poweredByHeader: false,

  // Next.js 15 optimizations
  experimental: {
    // Enable React 19 concurrent features (may require canary)
    // reactCompiler: true, // Temporarily disabled - conflicts with custom webpack chunking
    // Optimize for better performance
    // optimizeCss: true,
    // PPR only available in canary versions
    // ppr: "incremental",
  },

  // Turbopack configuration
  turbopack: {
    // Set the correct root directory
    root: __dirname,
    // Alias next/link to locale-aware Link for automatic locale preservation
    resolveAlias: {
      'next/link': path.resolve(__dirname, 'src/i18n/LinkShim.tsx'),
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
        hostname: 'plantocode-media.s3.amazonaws.com',
        port: '',
        pathname: '/**',
      },
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
  
  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: false,
  },

  // Rewrites are handled by withPlausibleProxy wrapper
  // async rewrites() {
  //   return [];
  // },
  
  // Redirects to eliminate chains shown in Google Search Console
  // Note: /en/:path* redirect is handled by proxy.ts middleware
  async redirects() {
    return [
      // Redirect old plan-mode related pages to the main plan-mode page
      {
        source: '/docs/codex-cli-plan-mode',
        destination: '/plan-mode/codex',
        permanent: true,
      },
      {
        source: '/docs/cursor-plan-mode',
        destination: '/plan-mode/cursor',
        permanent: true,
      },
      {
        source: '/docs/claude-code-plan-mode',
        destination: '/plan-mode/claude-code',
        permanent: true,
      },
      {
        source: '/codex-plan-mode',
        destination: '/plan-mode/codex',
        permanent: true,
      },
      {
        source: '/claude-plan-mode',
        destination: '/plan-mode/claude-code',
        permanent: true,
      },
      {
        source: '/cursor-plan-mode',
        destination: '/plan-mode/cursor',
        permanent: true,
      },
      {
        source: '/features/plan-editor',
        destination: '/plan-mode',
        permanent: true,
      },
      {
        source: '/de/features/plan-editor',
        destination: '/de/plan-mode',
        permanent: true,
      },
      {
        source: '/fr/features/plan-editor',
        destination: '/fr/plan-mode',
        permanent: true,
      },
      {
        source: '/es/features/plan-editor',
        destination: '/es/plan-mode',
        permanent: true,
      },
      // Redirect old security page to localized route
      {
        source: '/security/notarization',
        destination: '/en/security/notarization',
        permanent: true,
      },
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
        destination: 'https://www.plantocode.com/:path*',
        permanent: true,
      },
      // Fix non-www to www redirect chains
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'plantocode.com',
          },
        ],
        destination: 'https://www.plantocode.com/:path*',
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

  // NOTE: Webpack config removed - we use Turbopack (Next.js 16 default)
  // Turbopack handles optimization, code splitting, and bundling automatically
  // Source maps, tree shaking, and minification are built-in
};

export default withNextIntl(nextConfig);
