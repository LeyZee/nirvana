// Configuration ESLint (flat). Les frontières de modules (ADR 0002) sont appliquées ici.
// Ne jamais désactiver les règles `boundaries/*` : voir CLAUDE.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';

/** Modules métier de apps/api et leurs dépendances autorisées (docs/architecture/modules.md). */
const MODULE_DEPENDENCIES = {
  connectors: ['conversations'],
  conversations: ['fans', 'persona', 'agent', 'supervision', 'connectors', 'media'],
  fans: [],
  persona: [],
  agent: ['fans', 'persona', 'media'],
  media: [],
  supervision: ['conversations', 'fans'],
  sales: ['conversations', 'media'],
  scripts: ['sales', 'media', 'conversations'],
};

const moduleNames = Object.keys(MODULE_DEPENDENCIES);

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.output/**', '**/node_modules/**', '.scratch/**', '**/coverage/**', '**/*.config.*'],
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
        { type: 'module-tests', pattern: 'apps/api/src/modules/*/__tests__/**', capture: ['module'], mode: 'full' },
        { type: 'api-root', pattern: 'apps/api/src/*.ts', mode: 'full' },
        { type: 'api-test', pattern: 'apps/api/test/**', mode: 'full' },
        { type: 'package', pattern: 'packages/*/src/**', capture: ['package'], mode: 'full' },
        { type: 'app', pattern: 'apps/(web|extension)/src/**', capture: ['app'], mode: 'full' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
    },
    rules: {
      // Pureté du domaine et direction des dépendances dans un module.
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'module-domain', allow: [['module-domain', { module: '${from.module}' }], ['package', { package: 'contracts' }]] },
            {
              from: 'module-application',
              allow: [
                ['module-domain', { module: '${from.module}' }],
                ['module-application', { module: '${from.module}' }],
                ['package', { package: 'contracts' }],
                'module-index',
              ],
            },
            {
              from: 'module-infra',
              allow: [
                ['module-domain', { module: '${from.module}' }],
                ['module-application', { module: '${from.module}' }],
                ['module-infra', { module: '${from.module}' }],
                'package',
                'module-index',
              ],
            },
            { from: 'module-index', allow: [['module-domain', { module: '${from.module}' }], ['module-application', { module: '${from.module}' }], ['module-infra', { module: '${from.module}' }], 'package', 'module-index'] },
            { from: 'module-tests', allow: ['module-domain', 'module-application', 'module-infra', 'module-index', 'package', 'api-test'] },
            { from: 'api-root', allow: ['module-index', 'package'] },
            { from: 'api-test', allow: ['module-index', 'package', 'api-root', 'api-test'] },
            { from: 'package', allow: ['package'] },
            { from: 'app', allow: [['package', { package: 'contracts' }], 'app'] },
          ],
        },
      ],
      // Un module n'importe un autre module que par son index.ts.
      'boundaries/no-private': ['error', { allowUncles: false }],
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            // Le domaine ne fait pas d'I/O.
            { from: 'module-domain', disallow: ['drizzle-orm', 'fastify', 'graphile-worker', 'pg', 'undici', 'ai', /^@ai-sdk\//, /^node:(?!crypto$)/] },
            // Les SDK LLM ne sortent pas de packages/llm (ADR 0009).
            { from: [['package', { package: 'contracts' }], ['package', { package: 'db' }], 'module-domain', 'module-application', 'module-infra', 'app', 'api-root'], disallow: ['ai', /^@ai-sdk\//, 'openai', '@anthropic-ai/sdk', '@mistralai/mistralai'] },
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
        { selector: "TSEnumDeclaration", message: 'Utiliser des unions de littéraux et des schémas Zod (coding.md).' },
      ],
    },
  },
  {
    // Les scripts de build et les tests peuvent logguer.
    files: ['**/*.test.ts', '**/scripts/**'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  prettier,
);

export { MODULE_DEPENDENCIES, moduleNames };
