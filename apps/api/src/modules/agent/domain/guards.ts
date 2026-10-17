import { normalise } from './normalise';

/**
 * Guards on the voice output, before anything can be sent (docs/architecture/ai-engine.md, « Les gardes »).
 * Pure code: a blocking violation forbids sending, a soft one asks for a regeneration.
 */
export type GuardCode =
  | 'ai_disclosure'
  | 'love_declaration'
  | 'meeting_promise'
  | 'contact_info'
  | 'assistant_output'
  | 'ai_tic'
  | 'forbidden_term'
  | 'too_many_bubbles'
  | 'bubble_too_long';

export interface GuardViolation {
  readonly code: GuardCode;
  readonly severity: 'blocking' | 'soft';
  readonly bubbleIndex?: number;
  readonly match?: string;
}

export interface GuardSettings {
  readonly maxBubbles: number;
  readonly maxBubbleChars: number;
  /** Persona disgusts and hard limits, with their variants (persona-schema.md: also security data). */
  readonly forbiddenTerms: readonly string[];
}

export const DEFAULT_GUARD_SETTINGS: GuardSettings = {
  maxBubbles: 3,
  maxBubbleChars: 280,
  forbiddenTerms: [],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCKING_PATTERNS: readonly { code: GuardCode; pattern: RegExp }[] = [
  {
    code: 'ai_disclosure',
    // « je suis modèle photo », « je suis assistante dentaire » are jobs: the article is required for those words.
    pattern:
      /\b(je (ne )?suis|j'?suis|jsuis|moi c'est|i'?m)( qu'| que | juste | seulement )?\s?(une? |l'|an? )?(ia|ai|intelligence artificielle|bot|robot|chatbot)\b|\b(je suis|jsuis|j'suis) (une?|un simple) (assistante?|programme|modele( de langage)?)\b/,
  },
  { code: 'ai_disclosure', pattern: /\ben tant qu'(ia|assistante?|modele|intelligence artificielle)\b/ },
  {
    code: 'ai_disclosure',
    pattern: /\b(prompt|language model|modele de langage|mes instructions|grok|openai|xai)\b/,
  },
  { code: 'love_declaration', pattern: /\b(je t'?\s?aime|jtm|je suis amoureuse de toi)\b/ },
  // A concrete meeting (a day, a place, a visit) is blocked; the playful « un jour, peut-être » stays allowed.
  {
    code: 'meeting_promise',
    pattern:
      /\b(on se (voit|retrouve|rejoint) (demain|ce soir|ce week-end|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi|chez |a (la gare|l'hotel|paris|lyon)|au (cafe|bar|resto|restaurant))|je (viens|passe|monte) chez toi|viens chez moi|je te rejoins|mon adresse|rendez-vous (a |au |chez ))/,
  },
  { code: 'contact_info', pattern: /\b(https?:\/\/|www\.)\S+/ },
  { code: 'contact_info', pattern: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/ },
  { code: 'contact_info', pattern: /(\+?\d[\s.-]?){9,}/ },
  { code: 'contact_info', pattern: /\b(snap(chat)?|whatsapp|insta(gram)?|telegram)\b/ },
];

// What an assistant writes and a girl in her DMs never does: a recipe, code, steps, markdown, tags.
// Run on the raw bubble, where line breaks and symbols are still there.
const ASSISTANT_OUTPUT: readonly RegExp[] = [
  /```|^\s*#{1,6}\s/m,
  /^\s*(\d+[.)]|[-*•])\s.+\n\s*(\d+[.)]|[-*•])\s/m,
  /[<‹]\/?[a-z_]{2,}[>›]/i,
  /=>|\b(console\.log|def \w+\(|function \w*\(|select .+ from |import \w+ from|print\()/i,
];
// The same, on the normalised text.
const ASSISTANT_PHRASES =
  /\b(\d+ ?(g|gr|grammes|kg|ml|cl|cuilleres?|sachets?) d(e |')|cuilleres? a (soupe|cafe)|prechauffe|ingredients?\b|etape \d|voici (la|une|ta|ton|le) (recette|liste|traduction|reponse|code|resume|programme))/;

// Phrases that give a chat away as written by an AI (/mnt/project-files/chatting/etudes-agent-humain.md, 1.10).
const AI_TICS: readonly RegExp[] = [
  /\bje comprends (tout a fait|parfaitement)\b/,
  /\bn'hesite pas\b/,
  /\bhaha\b/,
  /\boh la la\b/,
  /\bje suis la pour toi\b/,
  /\bjuste pour toi\b/,
  /—/,
  /^\s*([-*•]|\d+[.)])\s/m,
];

export function checkVoiceOutput(bubbles: readonly string[], settings: GuardSettings): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const forbidden = settings.forbiddenTerms.map(normalise).filter((term) => term !== '');

  bubbles.forEach((bubble, bubbleIndex) => {
    const text = normalise(bubble);
    for (const { code, pattern } of BLOCKING_PATTERNS) {
      const match = pattern.exec(text);
      if (match) violations.push({ code, severity: 'blocking', bubbleIndex, match: match[0] });
    }
    const structure = ASSISTANT_OUTPUT.map((pattern) => pattern.exec(bubble)).find((m) => m !== null);
    const phrase = ASSISTANT_PHRASES.exec(text);
    const assistant = structure ?? phrase;
    if (assistant) {
      violations.push({ code: 'assistant_output', severity: 'blocking', bubbleIndex, match: assistant[0] });
    }
    for (const term of forbidden) {
      // Whole words only: the disgust « anal » must not block « banal » or « canal ».
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, 'u').test(text)) {
        violations.push({ code: 'forbidden_term', severity: 'blocking', bubbleIndex, match: term });
      }
    }
    const tic = AI_TICS.map((pattern) => pattern.exec(text)).find((m) => m !== null);
    if (tic) violations.push({ code: 'ai_tic', severity: 'soft', bubbleIndex, match: tic[0] });
    if (bubble.length > settings.maxBubbleChars) {
      violations.push({ code: 'bubble_too_long', severity: 'soft', bubbleIndex });
    }
  });
  if (bubbles.length > settings.maxBubbles) violations.push({ code: 'too_many_bubbles', severity: 'soft' });
  return violations;
}

export function isBlocked(violations: readonly GuardViolation[]): boolean {
  return violations.some((v) => v.severity === 'blocking');
}
