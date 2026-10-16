import { z } from 'zod';

/**
 * The only place the API reads its environment (docs/architecture/operations.md). Each task card adds the
 * variables it starts using; every variable in .env.example ends up here.
 */
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type Config = Readonly<z.infer<typeof ConfigSchema>>;

/** Validates the environment once at startup; a missing or malformed variable stops the process. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) throw new Error(`invalid environment:\n${z.prettifyError(result.error)}`);
  return Object.freeze(result.data);
}
