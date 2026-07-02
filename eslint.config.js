import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint flat config.
 *
 * Beyond the usual strictness, this config enforces the architectural
 * boundaries of the repository:
 *
 * 1. `src/client` and `src/shared` MUST NOT import runtime code from
 *    `src/server`. The client may import *types* from the server
 *    (e.g. to type an API response), which is why `allowTypeImports`
 *    is enabled for the client zone only.
 * 2. `src/shared` MUST NOT import from `src/client` either — shared code
 *    has to stay usable from both sides.
 * 3. `zod` may only be imported inside `src/shared/validation`. Everything
 *    else must go through the validation facade so the underlying schema
 *    library can be swapped (e.g. to yup) without touching consumers.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
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
  // React hooks rules for the client.
  {
    files: ['src/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // Boundary: client may not import server runtime code (types are allowed).
  {
    files: ['src/client/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@server/*', '**/server/**'],
              allowTypeImports: true,
              message:
                'The client must not import server runtime code. Move shared code to src/shared. (Type-only imports are allowed.)',
            },
          ],
        },
      ],
    },
  },
  // Boundary: shared may not import from client nor server at all.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@server/*', '**/server/**', '@client/*', '**/client/**'],
              allowTypeImports: false,
              message: 'Shared code must not depend on server or client modules.',
            },
          ],
        },
      ],
    },
  },
  // Facade: zod is an implementation detail of src/shared/validation.
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    ignores: ['src/shared/validation/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                'Import from @shared/validation instead. zod is an implementation detail behind the validation facade.',
            },
            {
              name: 'zod/mini',
              message:
                'Import from @shared/validation instead. zod is an implementation detail behind the validation facade.',
            },
          ],
        },
      ],
    },
  },
  // bun:test's `expect(...).rejects` matchers must be awaited at runtime but
  // are typed as non-thenable — keep the awaits, silence the false positive.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/await-thenable': 'off',
    },
  },
  // Config files at the repo root are not part of the typed project service.
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettierConfig,
);
