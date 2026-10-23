import { CreatorIdSchema, FanIdSchema, type FanFlags } from '@nirvana/contracts';

import type { FansModule } from '../../fans';
import type { Protection } from '../domain/hold';

/** His limits as the composer sees them: read before anything is written, set by the policy on a risk. */
export interface FanLimits {
  flags(creatorId: string, fanId: string): Promise<FanFlags>;
  protect(creatorId: string, fanId: string, protection: Protection, correlationId: string): Promise<void>;
}

/** The `fans` module behind the port; the policy is the author (`system`), the risks are the reason. */
export function createFanLimits(fans: Pick<FansModule, 'flags' | 'setFlag' | 'clearFlag'>): FanLimits {
  return {
    flags: (creatorId, fanId) => fans.flags(CreatorIdSchema.parse(creatorId), FanIdSchema.parse(fanId)),
    async protect(creatorId, fanId, protection, correlationId) {
      const creator = CreatorIdSchema.parse(creatorId);
      const fan = FanIdSchema.parse(fanId);
      const reason = protection.because.join(', ').slice(0, 500);
      const command: { author: 'system'; correlationId: string; reason?: string } = {
        author: 'system',
        correlationId,
        ...(reason !== '' && { reason }),
      };
      if (protection.stopContact)
        await fans.setFlag(creator, fan, { flag: 'doNotContact', value: true }, command);
      if (protection.unconfirmAge) await fans.clearFlag(creator, fan, 'ageConfirmedAt', command);
    },
  };
}
