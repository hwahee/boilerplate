import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint flat config, applied to the whole workspace.
 *
 * Beyond the usual strictness, this config enforces the architectural
 * boundaries of the monorepo:
 *
 * 1. `apps/mobile` and `packages/shared` MUST NOT import runtime code from
 *    `apps/server`. The mobile app may import *types* from the server
 *    (e.g. to type an API response), which is why `allowTypeImports`
 *    is enabled for the mobile zone only. (The server MAY import from the
 *    mobile app — the dependency rule is deliberately asymmetric.)
 * 2. `packages/shared` MUST NOT import from either app — shared code has to
 *    stay pure TypeScript, consumable by both Metro (Hermes) and Bun.
 * 3. `zod` may only be imported inside `packages/shared/src/validation`.
 *    Everything else must go through the validation facade so the schema
 *    library can be swapped (e.g. to yup) without touching consumers.
 * 4. Platform SDK facades: `expo-secure-store`, `expo-updates` and
 *    `@react-native-async-storage/async-storage` may only be imported inside
 *    their facade module — consumers depend on the facade interface.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/mobile/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/mobile/expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `await` on non-promises is usually a bug, and floating promises hide failures.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    },
  },
  // React hooks rules for the mobile app.
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // Boundary: the mobile app may not import server runtime code (types are allowed).
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/server', '@app/server/*', '**/apps/server/**'],
              allowTypeImports: true,
              message:
                'The mobile app must not import server runtime code. Move shared code to packages/shared. (Type-only imports are allowed.)',
            },
          ],
        },
      ],
    },
  },
  // Boundary: shared may not import from either app at all.
  // (Test files are exempt from the platform-purity part — they run under
  // `bun test` and import bun:test; production sources stay pure.)
  {
    files: ['packages/shared/**/*.{ts,tsx}'],
    ignores: ['packages/shared/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@app/server',
                '@app/server/*',
                '**/apps/server/**',
                '@app/mobile',
                '@app/mobile/*',
                '**/apps/mobile/**',
                // Shared code must run on Metro/Hermes AND Bun — no platform deps.
                'react-native',
                'react-native/*',
                'expo',
                'expo-*',
                'bun',
                'bun:*',
                'node:*',
              ],
              allowTypeImports: false,
              message:
                'Shared code must stay pure TypeScript: no app modules and no platform (Node/Bun/React Native) dependencies.',
            },
          ],
        },
      ],
    },
  },
  // Facade: zod is an implementation detail of packages/shared/src/validation.
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: ['packages/shared/src/validation/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                'Import from @app/shared/validation instead. zod is an implementation detail behind the validation facade.',
            },
            {
              name: 'zod/mini',
              message:
                'Import from @app/shared/validation instead. zod is an implementation detail behind the validation facade.',
            },
          ],
        },
      ],
    },
  },
  // Facades: platform SDKs may only be touched by their facade module.
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/storage/**', 'apps/mobile/src/version/updates.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-secure-store',
              message: 'Use the secure storage facade in src/storage/secure-store.ts instead.',
            },
            {
              name: 'expo-updates',
              message: 'Use the update channel facade in src/version/updates.ts instead.',
            },
            {
              name: '@react-native-async-storage/async-storage',
              message: 'Use the key-value storage facade in src/storage/kv-store.ts instead.',
            },
            {
              name: 'zod',
              message: 'Import from @app/shared/validation instead.',
            },
            {
              name: 'zod/mini',
              message: 'Import from @app/shared/validation instead.',
            },
          ],
        },
      ],
    },
  },
  // Shared TEST files may use bun:test but still must not import app code.
  {
    files: ['packages/shared/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/server', '@app/server/*', '**/apps/**'],
              allowTypeImports: false,
              message: 'Shared code (tests included) must not depend on app modules.',
            },
          ],
        },
      ],
    },
  },
  // bun:test's `expect(...).rejects` matchers must be awaited at runtime but
  // are typed as non-thenable — keep the awaits, silence the false positive.
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/await-thenable': 'off',
    },
  },
  // Config files are not part of the typed project service.
  {
    files: ['eslint.config.js', '**/babel.config.js', '**/metro.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/babel.config.js', '**/metro.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettierConfig,
);
