import type { PlaygroundEngine } from './engine';

/**
 * One playground per signed-in user, in memory (fiche P3-06): a restart empties them, the ratings stay in
 * their store. Each user trains on their own conversation; the rate is shared, since it measures the bot.
 */
export interface PlaygroundService {
  forUser(userId: string): PlaygroundEngine;
}

export function createPlaygroundService(createEngine: () => PlaygroundEngine): PlaygroundService {
  const engines = new Map<string, PlaygroundEngine>();
  return {
    forUser(userId) {
      let engine = engines.get(userId);
      if (engine === undefined) {
        engine = createEngine();
        engines.set(userId, engine);
      }
      return engine;
    },
  };
}
