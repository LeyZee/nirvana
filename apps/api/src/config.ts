import { z } from 'zod';

/** `1`/`true` or `0`/`false`, as written in an `.env` file. */
const flag = z
  .enum(['1', '0', 'true', 'false'])
  .default('0')
  .transform((value) => value === '1' || value === 'true');

/**
 * The only place that reads `process.env` (operations.md). Validated once at startup, frozen, and passed down.
 * Each task adds the variables it needs, documented in `.env.example`.
 */
const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Commit SHA of the running image (Sentry release, worker heartbeat); `dev` locally. */
    RELEASE: z.string().min(1).default('dev'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /** Application role: RLS applies, every tenant access goes through `withTenant`. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Owner role (BYPASSRLS): Graphile Worker's own schema, unscoped jobs, migration status for `/ready`. */
    DATABASE_ADMIN_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** The dashboard origin: the only one CORS lets in and the only one a mutation may come from (security.md §6). */
    WEB_ORIGIN: z.url(),
    /** Signs the dashboard session cookies (Better Auth); `openssl rand -base64 32`. */
    AUTH_SECRET: z.string().min(32),
    /** Public URL the browser reaches the API on (through the dashboard's proxy in development). */
    AUTH_BASE_URL: z.url(),
    /** Requests per minute and per IP before `429` (security.md §6). */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
    /** Jobs a worker runs at once; jobs of one conversation stay serial whatever this is (ADR 0006). */
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
    /** Development: run the worker inside the API process (`pnpm dev`). */
    NIRVANA_INLINE_WORKER: flag,
  })
  .refine(
    // `.env.example` placeholders are long enough to pass `min(32)`; production must not start with one.
    (config) => config.NODE_ENV !== 'production' || !config.AUTH_SECRET.startsWith('replace-'),
    { message: 'AUTH_SECRET still holds the .env.example placeholder', path: ['AUTH_SECRET'] },
  );

export type Config = Readonly<z.infer<typeof configSchema>>;

/** Parses the environment; throws with every invalid variable listed when the configuration is wrong. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return Object.freeze(parsed.data);
}
