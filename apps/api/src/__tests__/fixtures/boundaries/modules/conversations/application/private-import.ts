// Violation: another module's infra, bypassing its index.ts.
import { fansRepository } from '../../fans/infra/repository';

export const privateImport = fansRepository;
