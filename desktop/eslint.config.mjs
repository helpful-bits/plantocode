// @ts-check

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eslintJs from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicit imports for ESLint 9
import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import tseslintParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import sonarjs from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';

export default [
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/src-tauri/**',
      '**/gen/**',
      '**/*.gen.*',
      '**/.git/**',
      '**/.DS_Store',
      '**/.cache/**',
      '**/target/**',
      'vite.config.ts.timestamp-*.mjs',
      '**/temp/**',
      '**/tmp/**'
    ],
  },
  
  // Base ESLint recommended configuration
  eslintJs.configs.recommended,
  
  // TypeScript configuration
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslintPlugin,
    },
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json', './tsconfig.build.json'],
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    rules: {
      // Base rules to turn off (will be replaced by TS versions)
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-shadow': 'off',
      
      // TS rules with plugin prefix for ESLint 9
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': ['warn', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': [
        'warn',
        { checksVoidReturn: false }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-shadow': 'warn',
      '@typescript-eslint/no-redeclare': 'warn',
    },
  },
  
  // React configuration
  {
    files: ['src/**/*.tsx', 'src/**/*.jsx'],
    plugins: {
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React rules
      'react/prop-types': 'off',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-key': 'error',
      'react/display-name': 'warn',
      'react/no-array-index-key': 'warn',
      
      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      
      // JSX A11y rules
      'jsx-a11y/anchor-is-valid': [
        'warn',
        {
          components: ['Link'],
          specialLink: ['to', 'hrefLeft', 'hrefRight'],
          aspects: ['noHref', 'invalidHref', 'preferButton']
        }
      ],
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },
  
  // Import plugin configuration
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
    plugins: {
      'import': importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./tsconfig.json', './tsconfig.build.json'],
          tsconfigRootDir: __dirname,
        },
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    rules: {
      // General rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      'eqeqeq': ['error', 'always'],
      
      // Import rules
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type'
          ],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal',
              position: 'before'
            },
            {
              pattern: '@ui/**',
              group: 'internal',
              position: 'before'
            },
            {
              pattern: '@desktop/**',
              group: 'internal',
              position: 'before'
            }
          ],
          pathGroupsExcludedImportTypes: ['type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true }
        }
      ],
      'import/no-unresolved': 'error',
      'import/default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-cycle': ['warn', { maxDepth: 5 }],
      'import/prefer-default-export': 'off',
    },
  },
  
  // Overrides for specific files
  {
    files: [
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
      'scripts/**/*.ts'
    ],
    plugins: {
      'import': importPlugin,
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  
  // SonarJS recommended configuration
  sonarjs.configs.recommended,
  
  // Unicorn recommended configuration
  unicornPlugin.configs['flat/recommended'],
  
  // Unicorn rule overrides
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
    rules: {
      'unicorn/filename-case': ['warn', {
        cases: {
          camelCase: true,
          pascalCase: true,
          kebabCase: true,
        },
        ignore: [
          // Add regex patterns for files that should be ignored by this rule
          // Config files and standard filename conventions
          /vite\.config\.mts$/,
          /tailwind\.config\.ts$/,
          /postcss\.config\.mjs$/,
          /eslint\.config\.mjs$/,
          /components\.json$/,
          /tsconfig.*\.json$/,
        ]
      }],
      // Add other unicorn rule overrides here if needed
      'unicorn/prevent-abbreviations': 'off', // Often too strict
      'unicorn/no-null': 'off', // Null is commonly used in React state
      'unicorn/prefer-top-level-await': 'off', // Not always applicable in all frontend modules
    }
  },
  
  // Prettier compatibility (must be last)
  eslintConfigPrettier,
];