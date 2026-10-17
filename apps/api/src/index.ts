import { createApp } from './composition-root';
import { loadConfig } from './config';
import { buildServer } from './server';

const config = loadConfig();
createApp();
const server = buildServer(config);

try {
  await server.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (error) {
  server.log.fatal(error);
  process.exit(1);
}
