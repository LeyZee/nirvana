import {
  DomainError,
  type Destination,
  type PlaygroundAnswer,
  type PlaygroundComparison,
  type PlaygroundMedia,
  type PlaygroundRatingResult,
  type PlaygroundSituationPatch,
  type PlaygroundState,
  type Verdict,
} from '@nirvana/contracts';

/**
 * One trainer's playground: the P3-05 engine seen through the API's DTOs. The infra implements it over the
 * LLM gateway; the application only keeps one per user and maps its errors.
 */
export interface PlaygroundEngine {
  state(): PlaygroundState;
  applyPreset(presetId: string): PlaygroundState;
  reset(): PlaygroundState;
  send(text: string, media: readonly PlaygroundMedia[]): Promise<PlaygroundAnswer>;
  rate(verdict: Verdict, destination?: Destination): Promise<PlaygroundRatingResult>;
  branch(fanMessageNumber: number): Promise<PlaygroundState>;
  compare(voiceModel: string): Promise<PlaygroundComparison>;
  patchSituation(patch: PlaygroundSituationPatch): PlaygroundState;
  advance(hours: number): PlaygroundState;
  setNotes(notes: readonly string[]): PlaygroundState;
  sendCreatorMedia(media: PlaygroundMedia, isLocked: boolean): PlaygroundState;
}

/** No key reaches the voice model, main or fallback: the screen asks for the Grok key (503, set by the route). */
export class LlmUnavailable extends DomainError {
  constructor() {
    super(
      'llm_unavailable',
      'Aucun modèle de voix n’est joignable : ajoute la clé Grok dans Réglages > Modèles IA.',
    );
  }
}

export class NothingToRate extends DomainError {
  constructor() {
    super('nothing_to_rate_conflict', 'Rien à noter : envoie d’abord un message.');
  }
}

export class BlockedAnswer extends DomainError {
  constructor() {
    super('blocked_answer_conflict', 'Réponse bloquée par les gardes : corrige-la ou rejette-la.');
  }
}

export class PresetNotFound extends DomainError {
  constructor() {
    super('preset_not_found', 'Ce fan préréglé n’existe pas.');
  }
}

export class FanMessageNotFound extends DomainError {
  constructor() {
    super('fan_message_not_found', 'Ce message du fan n’existe pas dans la conversation.');
  }
}

export class VoiceModelInvalid extends DomainError {
  constructor() {
    super('voice_model_invalid', 'Modèle de voix inconnu.');
  }
}

export class TimeZoneInvalid extends DomainError {
  constructor() {
    super('time_zone_invalid', 'Fuseau horaire inconnu : un nom comme Europe/Paris.');
  }
}
