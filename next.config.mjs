/** @type {import('next').NextConfig} */ // Keep JSDoc comment
const nextConfig = {

    // Ensures 'sqlite3' is treated as an external module
    // and not bundled by Webpack for server-side code.
    // Necessary because it's a native Node.js addon.
    webpack: (config, { isServer }) => {
      // Ensure sqlite3 is treated as external on the server
      if (isServer) { // Keep conditional logic for server-side builds
        config.externals.push('sqlite3');
      } // Keep externals push
      return config;
    }, // Keep webpack function
};

export default nextConfig;
