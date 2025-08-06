import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    ignores: [
      'dist/**',
      'build/**', 
      'node_modules/**',
      'src-tauri/target/**',
      '*.min.js',
      'public/**',
      'coverage/**'
    ]
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'security': security,
      'sonarjs': sonarjs
    },
    rules: {
      // Core JavaScript security rules
      ...js.configs.recommended.rules,
      
      // TypeScript security rules
      '@typescript-eslint/no-explicit-any': 'error',
      
      // Security plugin rules - focused on preventing common vulnerabilities
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-regexp': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-new-buffer': 'error',
      
      // SonarJS security-related rules
      'sonarjs/no-hardcoded-passwords': 'error',
      'sonarjs/no-hardcoded-secrets': 'error',
      'sonarjs/no-hardcoded-ip': 'warn',
      
      // Additional security-focused rules
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-proto': 'error',
      'no-iterator': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'eval',
          message: 'eval() is dangerous and should not be used.'
        },
        {
          name: 'Function',
          message: 'Function constructor is dangerous and should not be used.'
        }
      ],
      
      // Prevent potential XSS vulnerabilities
      'no-useless-concat': 'error',
      'prefer-template': 'error',
      
      // Prevent prototype pollution
      'no-prototype-builtins': 'error',
      
      // Prevent timing attacks and other crypto issues
      'no-compare-neg-zero': 'error',
      
      // Authentication and authorization patterns
      'no-alert': 'error',
      'no-console': 'warn',
      
      // Data validation and sanitization
      'valid-typeof': 'error',
      'no-unsafe-negation': 'error',
      
      // Financial/billing specific security rules
      'no-floating-decimal': 'error',
      'no-loss-of-precision': 'error',
      'prefer-numeric-literals': 'error',
      
      // API security
      'no-global-assign': 'error',
      'no-implicit-globals': 'error',
      
      // Memory and resource management
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-unused-vars': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      
      // Prevent information disclosure
      'no-debugger': 'error',
      'no-caller': 'error',
      
      // Prevent injection vulnerabilities
      'no-multi-str': 'error',
      'no-octal-escape': 'error'
    }
  },
  {
    // Specific rules for TypeScript files
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Enhanced TypeScript security
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/prefer-as-const': 'error'
    }
  },
  {
    // Specific rules for configuration files
    files: ['**/*.config.{js,mjs,ts}', '**/*.config.*.{js,mjs,ts}'],
    rules: {
      // Allow require in config files
      'security/detect-non-literal-require': 'off',
      // Allow child_process in build configs
      'security/detect-child-process': 'warn'
    }
  },
  {
    // Test files have different security requirements
    files: ['**/*.test.{js,ts,tsx}', '**/*.spec.{js,ts,tsx}', '**/tests/**'],
    rules: {
      // Allow some patterns in tests that would be dangerous in production
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      'no-console': 'off'
    }
  }
];