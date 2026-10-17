import type { Logger } from './logger';

/** Hard stop if the graceful one hangs: under Docker's 30 s before `SIGKILL` (operations.md). */
const FORCED_EXIT_MS = 28_000;

/**
 * On `SIGTERM` or `SIGINT`, runs `stop` once and exits 0, or 1 if it failed or took too long. Each entry point
 * calls it once with what it started, in the order things must stop.
 */
export function exitGracefully(logger: Logger, stop: () => Promise<void>): void {
  let isStopping = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (isStopping) return;
    isStopping = true;
    logger.info({ signal }, 'shutting down');
    setTimeout(() => {
      logger.error('shutdown took too long, exiting');
      process.exit(1);
    }, FORCED_EXIT_MS).unref();
    stop().then(
      () => {
        logger.info('shutdown complete');
        process.exit(0);
      },
      (error: unknown) => {
        logger.error({ err: error }, 'shutdown failed');
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
}
