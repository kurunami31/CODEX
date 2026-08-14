// ESLint flat config (ESLint 9+).
//
// The point of this config is catching the class of bug that recently hit
// ScannerPage: code referencing an identifier that was never imported or
// declared. `no-undef` (from eslint:recommended) flags those at lint time —
// the bundler can't, because an undeclared identifier is treated as a
// browser global instead of an error.
//
//   api/, server/, scripts/      → Node environment (ESM)
//   client/src/, client/*.mjs    → Browser environment (ESM + JSX)
//   client/vite.config.js        → Node environment (runs under Vite)

import js from '@eslint/js';
import globals from 'globals';

const recommended = js.configs.recommended.rules;

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'client/dist/**', 'client/public/pwa-*.png'],
  },
  {
    files: ['api/**/*.js', 'server/**/*.js', 'scripts/**/*.mjs', 'client/vite.config.js', 'client/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...recommended,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['client/src/**/*.js', 'client/src/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      ...recommended,
      // The core no-unused-vars can't see JSX element usage (icons imported
      // and rendered as <XIcon /> look unused) — would need eslint-plugin-react.
      'no-unused-vars': 'off',
    },
  },
];
