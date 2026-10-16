// ESLint flat config. Module boundaries (ADR 0002) are enforced here.
// Never disable a `boundaries/*` rule: see CLAUDE.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';

/**
 * Business modules of apps/api and the modules each one may import (through their index.ts only).
 * Single source of truth, mirrored in docs/architecture/modules.md. No cycles allowed.
 */
const MODULE_DEPENDENCIES = {
  connectors: ['conversations'],
  conversations: ['fans', 'persona', 'agent', 'media'],
  fans: [],
  persona: [],
  agent: ['fans', 'persona', 'media'],
  media: [],
  supervision: ['conversations', 'fans'],
  sales: ['conversations', 'media'],
  scripts: ['sales', 'media', 'conversations'],
};

const moduleNames = Object.keys(MODULE_DEPENDENCIES);

/** For each module: its own layers plus the index.ts of the modules it may depend on. */
const moduleRules = moduleNames.flatMap((name) => {
  const own = (type) => [type, { module: name }];
  const allowedIndexes = MODULE_DEPENDENCIES[name].length > 0 ? [['module-index', { module: MODULE_DEPENDENCIES[name] }]] : [];
  return [
    { from: own('module-domain'), allow: [own('module-domain'), ['package', { package: 'contracts' }]] },
    { from: own('module-application'), allow: [own('module-domain'), own('module-application'), ['package', { package: 'contracts' }], ...allowedIndexes] },
    { from: own('module-infra'), allow: [own('module-domain'), own('module-application'), own('module-infra'), 'package', ...allowedIndexes] },
    { from: own('module-index'), allow: [own('module-domain'), own('module-application'), own('module-infra'), 'package', ...allowedIndexes] },
  ];
});

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.output/**', '**/node_modules/**', '.scratch/**', '**/coverage/**', '**/*.config.*', 'scripts/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { boundaries, 'import-x': importX },
    settings: {
      'import-x/resolver': { typescript: true },
      'boundaries/elements': [
        { type: 'module-domain', pattern: 'apps/api/src/modules/*/domain/**', capture: ['module'], mode: 'full' },
        { type: 'module-application', pattern: 'apps/api/src/modules/*/application/**', capture: ['module'], mode: 'full' },
        { type: 'module-infra', pattern: 'apps/api/src/modules/*/infra/**', capture: ['module'], mode: 'full' },
        { type: 'module-index', pattern: 'apps/api/src/modules/*/index.ts', capture: ['module'], mode: 'full' },
        { type: 'api-tests', pattern: 'apps/api/src/__tests__/**', mode: 'full' },
        { type: 'api-scripts', pattern: 'apps/api/src/scripts/**', mode: 'full' },
        { type: 'api-root', pattern: 'apps/api/src/*.ts', mode: 'full' },
        { type: 'api-test', pattern: 'apps/api/test/**', mode: 'full' },
        { type: 'package', pattern: 'packages/*/src/**', capture: ['package'], mode: 'full' },
        { type: 'web', pattern: 'apps/web/src/**', mode: 'full' },
        { type: 'extension', pattern: 'apps/extension/src/**', mode: 'full' },
        { type: 'evals', pattern: 'evals/**', mode: 'full' },
      ],
      // Test files next to the code may import anything inside their own package.
      'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
    },
    rules: {
      // Layer purity inside a module, and the dependency graph between modules.
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            ...moduleRules,
            { from: 'api-root', allow: ['module-index', 'package', 'api-root'] },
            { from: 'api-scripts', allow: ['module-index', 'package', 'api-root'] },
            { from: 'api-tests', allow: ['module-index', 'package', 'api-root', 'api-test', 'api-tests'] },
            { from: 'api-test', allow: ['module-index', 'package', 'api-root', 'api-test'] },
            { from: 'package', allow: ['package'] },
            // design-system: ADR 0015 (proposed). Apps may import it next to contracts.
            { from: 'web', allow: [['package', { package: 'contracts' }], ['package', { package: 'design-system' }], 'web'] },
            { from: 'extension', allow: [['package', { package: 'contracts' }], ['package', { package: 'design-system' }], 'extension'] },
            { from: 'evals', allow: [['package', { package: 'contracts' }], ['package', { package: 'llm' }], 'evals'] },
          ],
        },
      ],
      // Importing a module through anything but its index.ts (for example `modules/fans/infra/...`) is an error.
      'boundaries/no-private': ['error', { allowUncles: false }],
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            // The domain does no I/O.
            { from: 'module-domain', disallow: ['drizzle-orm', 'fastify', 'graphile-worker', 'pg', 'undici', 'ai', /^@ai-sdk\//, /^node:(?!crypto$)/] },
            // LLM SDKs never leave packages/llm (ADR 0009).
            { from: [['package', { package: 'contracts' }], ['package', { package: 'db' }], 'module-domain', 'module-application', 'module-infra', 'web', 'extension', 'api-root', 'api-scripts', 'evals'], disallow: ['ai', /^@ai-sdk\//, 'openai', '@anthropic-ai/sdk', '@mistralai/mistralai'] },
          ],
        },
      ],
      'import-x/order': ['error', { 'newlines-between': 'always', alphabetize: { order: 'asc' } }],
      'import-x/no-cycle': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use literal unions and Zod schemas instead of enums (coding.md).' },
      ],
    },
  },
  {
    // Tests and ops scripts may log to the console.
    files: ['**/*.test.ts', '**/scripts/**', 'evals/**'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  prettier,
);

export { MODULE_DEPENDENCIES, moduleNames };
