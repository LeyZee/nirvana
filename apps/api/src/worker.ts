import { createApp } from './composition-root';
import { loadConfig } from './config';

// Graphile Worker arrives with P0-04. Until then the worker entry point only proves the wiring loads.
loadConfig();
createApp();
