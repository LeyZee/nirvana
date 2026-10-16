// A module reaches into another module's infra instead of going through its index.ts.
import { fansRepository } from '../../fans/infra/repository.js';

export const repository = fansRepository;
