/** Shared Zod schemas (events, DTOs, extension protocol, media vocabulary, persona). Filled by P0-02. */
export const CONTRACTS_PACKAGE = '@nirvana/contracts';

export {
  MEDIA_VOCABULARY_VERSION,
  MediaDescriptionSchema,
  type MediaDescription,
  type MediaFlag,
} from './media';
export { err, ok, type Result } from './result';
export * from './persona';
