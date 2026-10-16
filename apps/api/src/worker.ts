// Worker entry point (Graphile Worker arrives with P0-04). It shares the config and composition root with the API.
import { createCompositionRoot } from './composition-root.js';
import { loadConfig } from './config.js';

createCompositionRoot(loadConfig(process.env));
