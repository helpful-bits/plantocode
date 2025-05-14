/** @type {import('next').NextConfig} */ // Keep JSDoc comment
const nextConfig = {
    // Static export configuration for Tauri
    output: 'export',
    
    // Required for static export
    images: {
      unoptimized: true,
    },

    // Ensures 'sqlite3' is treated as an external module
    // and not bundled by Webpack for server-side code.
    // Necessary because it's a native Node.js addon.
    webpack: (config, { isServer }) => {
      // Ensure sqlite3 is treated as external on the server
      if (isServer) { // Keep conditional logic for server-side builds
        config.externals.push('sqlite3');
      } // Keep externals push
      
      // Fix for Node.js core modules
      if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          fs: false,
          path: false,
          os: false
        };
      }
      
      // Increase chunk loading timeout
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 300,
        poll: 1000,
      };
      
      return config;
    }, // Keep webpack function
    
    // Configure Server Actions body size limit
    experimental: {
      serverActions: {
        bodySizeLimit: '16mb' // Increase the body size limit from default 1MB to 4MB
      }
    },
    
    // Add optimization settings
    poweredByHeader: false,
    reactStrictMode: true,
    onDemandEntries: {
      // Keep pages in memory for longer
      maxInactiveAge: 25 * 1000,
      // Have more pages loaded at once
      pagesBufferLength: 5,
    },
    
    // Disable request logging to prevent log flood during development
    logging: {
      // Turn off all incoming request logs completely
      incomingRequests: false,
    },
};

export default nextConfig;
