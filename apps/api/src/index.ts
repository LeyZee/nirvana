// API entry point. /ready and the inline worker arrive with P0-04.
import { createCompositionRoot } from './composition-root.js';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

const root = createCompositionRoot(loadConfig(process.env));
const server = buildServer(root);
await server.listen({ port: root.config.PORT, host: '127.0.0.1' });
