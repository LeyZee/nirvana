import { z } from 'zod';

/**
 * The only place that reads `process.env` (operations.md). Validated once at startup, frozen, and passed down.
 * Each task adds the variables it needs, documented in `.env.example`.
 */
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type Config = Readonly<z.infer<typeof configSchema>>;

/** Parses the environment; throws with every invalid variable listed when the configuration is wrong. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return Object.freeze(parsed.data);
}
