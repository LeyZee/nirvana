// The domain never depends on infra, not even its own module's.
import { fansRepository } from '../infra/repository.js';

export const repository = fansRepository;
