import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {
      // Explicitly specify the path to the Tailwind config for src
      config: path.join(__dirname, 'tailwind.config.ts'),
      // Explicitly disable the node_modules warning
      hideNodeModulesWarning: true,
    },
    autoprefixer: {},
  },
};

export default config;
