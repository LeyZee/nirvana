import type { Database } from '@nirvana/db';

import { createFansService, type FansService } from './application/fans';
import { createDrizzleFanStore } from './infra/fan-store';

/** Public entry point of the `fans` module (ADR 0002). Other modules import this file only. */
export interface FansModule extends FansService {
  readonly name: 'fans';
}

export interface FansDeps {
  /** Application role (RLS). */
  readonly db: Database;
}

export function createFansModule(deps: FansDeps): FansModule {
  return { name: 'fans', ...createFansService(createDrizzleFanStore(deps.db)) };
}
