// ESLint flat config. Module boundaries (ADR 0002) are enforced here.
// Never disable a `boundaries/*` rule: see CLAUDE.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
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

/** Selects the `index.ts` of the given modules: the only file of a module that another module may import. */
const moduleIndexes = (modules) => ({
  element: { type: 'module', captured: { module: modules }, fileInternalPath: 'index.ts' },
});
const ownLayer = (type, module) => ({ element: { type, captured: { module } } });
const packages = (...names) => ({ element: { type: 'package', captured: { package: names } } });
const element = (type) => ({ element: { type } });

/** For each module: its own layers, plus the index.ts of the modules it may depend on (MODULE_DEPENDENCIES). */
const modulePolicies = moduleNames.flatMap((module) => {
  const own = (type) => ownLayer(type, module);
  const dependencies = MODULE_DEPENDENCIES[module];
  const indexes = dependencies.length > 0 ? [moduleIndexes(dependencies)] : [];
  return [
    { from: own('module-domain'), allow: { to: [own('module-domain'), packages('contracts')] } },
    {
      from: own('module-application'),
      allow: { to: [own('module-domain'), own('module-application'), packages('contracts'), ...indexes] },
    },
    {
      from: own('module-infra'),
      allow: {
        to: [
          own('module-domain'),
          own('module-application'),
          own('module-infra'),
          element('package'),
          ...indexes,
        ],
      },
    },
    {
      from: own('module'),
      allow: {
        to: [
          own('module-domain'),
          own('module-application'),
          own('module-infra'),
          element('package'),
          ...indexes,
        ],
      },
    },
  ];
});

/** LLM SDKs never leave packages/llm (ADR 0009). */
const LLM_SDKS = ['ai', '@ai-sdk/*', 'openai', '@anthropic-ai/sdk', '@mistralai/mistralai'];

/**
 * Element descriptors. `modulesRoot` is where the business modules live; the boundaries test points it at a fixture tree.
 * Order matters: the first descriptor that matches a file wins, so the most specific folders come first.
 */
function boundaryElements(modulesRoot = 'apps/api/src/modules') {
  const layer = (type, folder) => ({
    type,
    pattern: `${modulesRoot}/*/${folder}`,
    capture: ['module'],
    partialMatch: false,
  });
  return [
    layer('module-domain', 'domain'),
    layer('module-application', 'application'),
    layer('module-infra', 'infra'),
    { type: 'module', pattern: `${modulesRoot}/*`, capture: ['module'], partialMatch: false },
    { type: 'api-tests', pattern: 'apps/api/src/__tests__', partialMatch: false },
    { type: 'api-scripts', pattern: 'apps/api/src/scripts', partialMatch: false },
    { type: 'api-root', pattern: 'apps/api/src', partialMatch: false },
    { type: 'api-test', pattern: 'apps/api/test', partialMatch: false },
    // The whole src/ folder of a package is one element: apps import its index.ts through the package name.
    { type: 'package', pattern: 'packages/*/src', capture: ['package'], partialMatch: false },
    { type: 'web', pattern: 'apps/web/src', partialMatch: false },
    { type: 'extension', pattern: 'apps/extension/src', partialMatch: false },
    { type: 'evals', pattern: 'evals', partialMatch: false },
  ];
}

/**
 * The single boundaries rule (eslint-plugin-boundaries 7). Default: disallow. The last matching policy wins, so the
 * general external allowance comes first and the targeted bans after it.
 */
const BOUNDARIES_POLICIES = [
  // External packages and Node built-ins are allowed by default; the policies at the end narrow this.
  { allow: { to: { module: { origin: ['external', 'core'] } } } },
  ...modulePolicies,
  { from: element('api-root'), allow: { to: [moduleIndexes('*'), element('package'), element('api-root')] } },
  {
    from: element('api-scripts'),
    allow: { to: [moduleIndexes('*'), element('package'), element('api-root')] },
  },
  {
    from: element('api-tests'),
    allow: {
      to: [
        moduleIndexes('*'),
        element('package'),
        element('api-root'),
        element('api-test'),
        element('api-tests'),
      ],
    },
  },
  {
    from: element('api-test'),
    allow: { to: [moduleIndexes('*'), element('package'), element('api-root'), element('api-test')] },
  },
  { from: element('package'), allow: { to: element('package') } },
  // design-system: ADR 0015. Apps may import it next to contracts.
  { from: element('web'), allow: { to: [packages('contracts', 'design-system'), element('web')] } },
  {
    from: element('extension'),
    allow: { to: [packages('contracts', 'design-system'), element('extension')] },
  },
  { from: element('evals'), allow: { to: [packages('contracts', 'llm'), element('evals')] } },
  // The domain does no I/O: no driver, framework or SDK, and no Node built-in but node:crypto (UUIDs).
  {
    from: element('module-domain'),
    disallow: {
      to: [
        {
          module: {
            origin: 'external',
            source: ['drizzle-orm', 'fastify', 'graphile-worker', 'pg', 'undici', ...LLM_SDKS],
          },
        },
        { module: { origin: 'core', source: '!node:crypto' } },
      ],
    },
  },
  {
    from: [
      packages('contracts', 'db'),
      element('module-domain'),
      element('module-application'),
      element('module-infra'),
      element('module'),
      element('web'),
      element('extension'),
      element('api-root'),
      element('api-scripts'),
      element('evals'),
    ],
    disallow: { to: { module: { origin: 'external', source: LLM_SDKS } } },
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.output/**',
      '**/node_modules/**',
      '.scratch/**',
      '**/coverage/**',
      '**/*.config.*',
      '**/.wxt/**',
      'scripts/**',
      'apps/api/src/__tests__/fixtures/**',
    ],
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
      // Paths in `boundaries/elements` are relative to the repository root, whatever directory ESLint runs from
      // (turbo runs `eslint` inside each package).
      'boundaries/root-path': import.meta.dirname,
      // boundaries resolves imports through the eslint-plugin-import setting, import-x through its own.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json', 'evals/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
      // import-x parses the imported files itself (needed by no-cycle): TypeScript sources need the TS parser.
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import-x/extensions': ['.ts', '.tsx', '.js', '.mjs'],
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json', 'evals/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
      'boundaries/elements': boundaryElements(),
      // Test files next to the code may import anything inside their own package.
      'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
    },
    rules: {
      // Layer purity inside a module, the module graph, and the external packages each layer may use.
      'boundaries/dependencies': [
        'error',
        { default: 'disallow', checkAllOrigins: true, policies: BOUNDARIES_POLICIES },
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
        {
          selector: 'TSEnumDeclaration',
          message: 'Use literal unions and Zod schemas instead of enums (coding.md).',
        },
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

export { MODULE_DEPENDENCIES, boundaryElements, moduleNames };
