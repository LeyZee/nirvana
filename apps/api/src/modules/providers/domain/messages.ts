import type { AiProvider, ProviderErrorKind } from '@nirvana/contracts';

import { profileOf } from './catalog';

/**
 * The single translation table (fiche P3-03, § Quand ça ne marche pas): the sheet, the Services line, the Dashboard
 * banner and the log all show the same sentence for the same problem. No HTTP code ever reaches the screen.
 */
export interface RefusalDetails {
  readonly belongsTo?: AiProvider;
  readonly availableModels?: readonly string[];
  readonly permission?: string;
  readonly visionModel?: string;
}

const PERMISSION_LABELS: Readonly<Record<string, string>> = {
  voices_read: 'Voices en lecture',
  user_read: 'User en lecture',
  text_to_speech: 'Text to Speech',
};

export function describeRefusal(
  provider: AiProvider,
  kind: ProviderErrorKind,
  details: RefusalDetails = {},
): string {
  const { vendor } = profileOf(provider);
  switch (kind) {
    case 'too_short':
      return `Cette clé paraît incomplète. Copie-la en entier depuis ${vendor}.`;
    case 'wrong_provider': {
      const owner = details.belongsTo === undefined ? undefined : profileOf(details.belongsTo);
      return owner === undefined
        ? `Cette clé ne vient pas de ${vendor}.`
        : `Cette clé vient de ${owner.vendor} : elle va dans ${owner.service}.`;
    }
    case 'unauthorized':
      return `${vendor} ne reconnaît pas cette clé. Vérifie qu’elle est copiée en entier.`;
    case 'model_not_allowed':
      return `Cette clé n’a pas accès à Grok 4.7. Dans la console ${vendor}, ajoute grok-4.7 à ses modèles.`;
    case 'no_credit':
      return `Le compte ${vendor} n’a plus de crédit. Recharge-le, puis réessaie.`;
    case 'api_not_enabled':
      return 'Ce projet Google n’a pas accès à l’API Gemini. Recrée la clé depuis AI Studio.';
    case 'vision_model_missing': {
      const wanted = details.visionModel ?? 'Le modèle de vision';
      const found = details.availableModels ?? [];
      return found.length === 0
        ? `${wanted} n’est pas visible avec cette clé, et aucun modèle Gemini non plus.`
        : `${wanted} n’est pas visible avec cette clé. Modèles trouvés : ${found.join(', ')}.`;
    }
    case 'missing_permission': {
      const label = details.permission === undefined ? undefined : PERMISSION_LABELS[details.permission];
      return label === undefined
        ? `La clé n’a pas tous les accès nécessaires. Vérifie ses accès dans ${vendor}.`
        : `La clé ne peut pas lire tout ce qu’il faut. Ajoute ${label} à ses accès.`;
    }
    case 'unreachable':
      return `${vendor} ne répond pas ou freine les vérifications. Ta clé n’est pas en cause ; réessaie dans une minute.`;
  }
}

/** About 100 characters per voice note (vocaux/recherche-et-conception.md). */
const AVERAGE_VOICE_NOTE_CHARACTERS = 100;

export function voiceNotesLeft(charactersLeft: number): number {
  return Math.max(0, Math.floor(charactersLeft / AVERAGE_VOICE_NOTE_CHARACTERS));
}

export function describeLowCredit(charactersLeft: number): string {
  return `Plus que ${voiceNotesLeft(charactersLeft).toLocaleString('fr-FR')} vocaux ce mois. Recharge avant d’en manquer.`;
}
