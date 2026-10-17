import { loadConfig, type Config } from '../../config';

/** A complete configuration for tests; the database URLs point nowhere unless a test overrides them. */
export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://nirvana_app:test@127.0.0.1:1/nirvana',
    DATABASE_ADMIN_URL: 'postgres://nirvana_admin:test@127.0.0.1:1/nirvana',
    WEB_ORIGIN: 'http://localhost:5173',
    ...overrides,
  });
}
