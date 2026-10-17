import type { AiProvider } from '@nirvana/contracts';

/**
 * What the sheet teaches for each service: where to create the key and with which settings. The state of a service,
 * its facts and every refusal come from the API (`domain/messages.ts`), so they read the same everywhere.
 */

export type DashboardProvider = Extract<AiProvider, 'xai' | 'google' | 'elevenlabs'>;

interface GuideTick {
  readonly label: string;
  /** Shown as text; `copy` adds a copy button, `code` sets it in mono. */
  readonly value: string;
  readonly copy?: boolean;
  readonly code?: boolean;
}

export interface ServiceGuide {
  readonly name: string;
  readonly brand: string;
  readonly vendor: string;
  readonly role: string;
  /** Without it the agent stops: no « Plus tard ». */
  readonly isRequired: boolean;
  readonly console: { readonly label: string; readonly url: string };
  readonly where: string;
  readonly ticks: readonly GuideTick[];
  readonly note: string | null;
  /** What stops if the key is removed, said in the confirmation. */
  readonly offConsequence: string;
  readonly topUpUrl: string | null;
}

export const GUIDES: Record<DashboardProvider, ServiceGuide> = {
  xai: {
    name: 'Grok',
    brand: 'xAI',
    vendor: 'xAI',
    role: 'Écrit les messages et décide',
    isRequired: true,
    console: { label: 'Ouvrir la console xAI', url: 'https://console.x.ai' },
    where: 'Dans API Keys, crée une clé avec :',
    ticks: [
      { label: 'Nom', value: 'nirvana-prod', copy: true },
      { label: 'Modèles', value: 'grok-4.7 et grok-4.3', code: true },
      { label: 'Accès', value: 'Chat' },
    ],
    note: 'Le compte xAI doit avoir du crédit.',
    offConsequence: 'L’agent passera en copilote : il proposera, tu enverras.',
    topUpUrl: 'https://console.x.ai',
  },
  google: {
    name: 'Gemini',
    brand: 'Google',
    vendor: 'Google',
    role: 'Regarde les photos et vidéos',
    isRequired: false,
    console: { label: 'Ouvrir Google AI Studio', url: 'https://aistudio.google.com/apikey' },
    where: 'Clique sur Create API key, puis :',
    ticks: [
      { label: 'Projet', value: 'Nirvana', code: true },
      { label: 'Restriction', value: 'Restrict to Gemini API only' },
    ],
    note: 'Active la facturation du projet. En offre gratuite, Google peut garder les médias des fans.',
    offConsequence: 'Grok regardera les photos et vidéos à la place de Gemini.',
    topUpUrl: 'https://aistudio.google.com',
  },
  elevenlabs: {
    name: 'ElevenLabs',
    brand: 'Vocaux',
    vendor: 'ElevenLabs',
    role: 'Parle avec la voix de Messa',
    isRequired: false,
    console: { label: 'Ouvrir ElevenLabs', url: 'https://elevenlabs.io/app/settings/api-keys' },
    where: 'Crée une clé avec :',
    ticks: [
      { label: 'Nom', value: 'nirvana-prod', copy: true },
      { label: 'Accès', value: 'Text to Speech, Voices et User en lecture' },
      { label: 'Limite', value: '100 000 caractères par mois', code: true },
    ],
    note: null,
    offConsequence: 'Le copilote ne proposera plus de vocaux.',
    topUpUrl: 'https://elevenlabs.io/app/subscription',
  },
};

export function isDashboardProvider(provider: AiProvider): provider is DashboardProvider {
  return provider in GUIDES;
}
