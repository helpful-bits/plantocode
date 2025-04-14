/** @type {import('next').NextConfig} */
const nextConfig = {

    // This ensures 'sqlite3' is treated as an external module
    // and not bundled by Webpack for server-side code.
    // Necessary because it's a native Node.js addon.
    webpack: (config, { isServer }) => {
      // Ensure sqlite3 is treated as external on the server
      if (isServer) {
        config.externals.push('sqlite3');
      }
      return config;
    }
};
export default nextConfig;
