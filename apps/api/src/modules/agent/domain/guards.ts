import { normalise, unmask } from './normalise';

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
  | 'bubble_too_long'
  | 'asks_for_nudes'
  | 'contempt'
  | 'payment_lie'
  | 'guilt_trip'
  | 'pet_name';

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
  /** The only pet names she gives (`behavior.pet_names`); undefined: not checked. */
  readonly petNames?: readonly string[];
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
    pattern:
      /\b(prompt|language model|modele de langage|mes instructions|grok|openai|xai|chatgpt|gpt|llm|anthropic|gemini)\b/,
  },
  // Said of herself in the third person: « tu parles à une IA », « c'est un bot qui te répond ».
  {
    code: 'ai_disclosure',
    pattern:
      /\btu (parles|discutes|ecris|chattes?) (a|avec) (une?|l') ?(ia|ai|bot|robot|chatbot|machine|programme|intelligence artificielle)\b|\bc'?est (une?|l') ?(ia|ai|bot|robot|chatbot|programme|intelligence artificielle) qui\b/,
  },
  // « une lA » typed with a lowercase L, or a Cyrillic palochka read as one.
  { code: 'ai_disclosure', pattern: /\b(je suis|jsuis|j'?suis|chuis?|chu) (qu'|juste )?une la\b/ },
  // Spoken and other-language admissions: « chui une IA », « I am an AI », « soy una IA ».
  {
    code: 'ai_disclosure',
    pattern: /\b(chui|chuis|chu) (qu'|juste |seulement )?(une?|l') ?(ia|ai|bot|robot|chatbot)\b/,
  },
  {
    code: 'ai_disclosure',
    pattern:
      /\b(i am|i'?m|im) (just |only )?an? (ai|bot|robot|chatbot|language model|virtual assistant)\b|\bas an (ai|assistant|language model)\b/,
  },
  {
    code: 'ai_disclosure',
    pattern:
      /\b(soy|estoy) (solo |solamente )?(una?|un) (ia|bot|robot|chatbot|asistente|inteligencia artificial)\b|\bcomo (una )?(ia|asistente|inteligencia artificial)\b/,
  },
  {
    code: 'love_declaration',
    pattern: /\b(je t'?\s?aime|j'?t'?aime|jtm|je suis amoureuse de toi|i love you|te (quiero|amo))\b/,
  },
  // A concrete meeting (a day, a place, a visit) is blocked; the playful « un jour, peut-être » stays allowed.
  {
    code: 'meeting_promise',
    pattern:
      /\b(on se (voit|retrouve|rejoint) (demain|ce soir|ce week-end|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi|chez |a (la gare|l'hotel|paris|lyon)|au (cafe|bar|resto|restaurant))|je (viens|passe|monte) chez toi|viens chez moi|je te rejoins|mon adresse|rendez-vous (a |au |chez ))/,
  },
  { code: 'contact_info', pattern: /\b(https?:\/\/|www\.)\S+/ },
  { code: 'contact_info', pattern: /\b[\w.+-]+ ?@ ?[\w-]+ ?\. ?[\w.]+\b/ },
  { code: 'contact_info', pattern: /(\+?\d[\s.,/-]{0,2}){9,}/ },
  { code: 'contact_info', pattern: /\b(snap(chat)?|whatsapp|insta(gram)?|telegram)\b/ },
  // « lina at gmail dot com », « lina (arobase) gmail point fr », « lina @ gmail point com ». A word on each side:
  // « ma chatte point ça » is not an address.
  {
    code: 'contact_info',
    pattern:
      /[\w.+-]+( | ?[([] ?)(at|arobase|@)( | ?[)\]] ?)[\w-]+( | ?[([] ?)(dot|point)( | ?[)\]] ?)(com|fr|net|org|io|be|ch|me|es|co|de|it|eu|info)\b/,
  },
  // Sales corpus (§4): she never asks him for intimate pictures, never despises him, never lies about paid content.
  // A request (a verb asking to see or receive) about his intimate body: her own « les nudes c'est pas mon truc »,
  // « ta queue de cheval » or « ton paquet de chips » pass.
  {
    code: 'asks_for_nudes',
    pattern:
      /\b(envoie|montre|fais(-| )?(moi )?voir|je (veux|voudrais) voir|j'?veux voir|tu m'?envoies?)[sz]?(-| )?(moi )?.{0,40}\b(des nudes?|un nude|une? dick ?pic|toi (tout nu|a poil)|tout nu|a poil|ta (bite|queue)(?! de)|ton (sexe|zizi))\b/,
  },
  // Contempt, not teasing: « petit menteur va 😏 » stays hers, « sale radin » or « espèce de mendiant » never.
  {
    code: 'contempt',
    pattern:
      /\b(sale|espece de|t'?es (qu'?)?une?|tu es (qu'?)?une?|quel|quelle) (radin|radine|rapiat|rapiate|menteur|menteuse|mendiant|mendiante|crevard|crevarde|minable|pauvre type)s?\b|\b(mendiant|mendiante|crevard|crevarde|pauvre type)s?\b/,
  },
  // « Rien à payer » about a paid bundle is a lie; « pas besoin de payer pour me parler » is true.
  {
    code: 'payment_lie',
    pattern:
      /\b(rien a payer|pas besoin (de payer|d'argent|de sous)|(t'?as|tu (n'?)?as) (rien|pas) a payer)\b(?! pour (me |te )?(parler|discuter|ecrire))/,
  },
];

// After a refusal she whines once, playfully, then lets go: no guilt (sales corpus, §2.4). A regeneration, not a block.
// Pet names a girl may give a fan; one she never uses is a voice slip (persona `behavior.pet_names`).
const COMMON_PET_NAMES = [
  'bebe',
  'cheri',
  'mon cheri',
  'mon coeur',
  'mon amour',
  'mon chou',
  'chaton',
  'mon ange',
  'loulou',
  'doudou',
  'mon lapin',
  'beau gosse',
  'mon grand',
  'mon beau',
  'mon bel inconnu',
];

const GUILT_TRIP =
  /\b(tu me decois|ca m'a refroidie?|ca me rend (triste|malheureuse)|tu me fais de la peine|je suis (vexee|decue)|arrete de faire (le|ton) radin)\b(?! pas)/;

// What an assistant writes and a girl in her DMs never does: a recipe, code, steps, markdown, tags.
// Run on the raw bubble, where line breaks and symbols are still there.
const ASSISTANT_OUTPUT: readonly RegExp[] = [
  /```|^\s*#{1,6}\s/m,
  /^\s*(\d+[.)]|[-*•])\s.+\n\s*(\d+[.)]|[-*•])\s/m,
  /[<‹]\/?[a-z_]{2,}[>›]/i,
  /\b(console\.log|def \w+\(|function \w*\(|select .+ from |import \w+ from|print\()/i,
];
// The same, on the normalised text. One of these alone gives an assistant away.
const ASSISTANT_PHRASES =
  /\b(voici (la|une|ta|ton|le) (recette|traduction|code|resume)|cuilleres? a (soupe|cafe)|prechauffe[rz]? (le|ton|votre) four)/;
// A recipe takes two of these: a girl may say « 52 kg », « 5 ml de lubrifiant » or « l'ingrédient secret c'est toi ».
const RECIPE_SIGNALS: readonly RegExp[] = [
  /\b\d+ ?(g|gr|grammes|kg|ml|cl|sachets?) d(e |')/,
  /\bingredients?\b/,
  /\b(farine|levure|sucre en poudre|sucre glace|beurre doux|pate brisee|pate sablee)\b/,
  /\bfour a \d+/,
  /\b(melange|ajoute|incorpore|fouette|verse)[rsz]? (le|la|les|un|une|des|bien|ensuite)\b/,
];

function recipeMatch(text: string): string | undefined {
  const hits = RECIPE_SIGNALS.map((pattern) => pattern.exec(text)?.[0]).filter((m) => m !== undefined);
  return hits.length >= 2 ? hits.join(' … ') : undefined;
}

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

// A phone number written in words, or in words and digits: « zéro six, douze, trente-quatre… », « 06 douze 34… ».
// Values of the single words, to tell a count (« dix, neuf, huit… ») from a number.
const NUMBER_WORDS: Readonly<Record<string, number | undefined>> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: undefined,
  douze: undefined,
  treize: undefined,
  quatorze: undefined,
  quinze: undefined,
  seize: undefined,
  vingt: undefined,
  trente: undefined,
  quarante: undefined,
  cinquante: undefined,
  soixante: undefined,
  septante: undefined,
  huitante: undefined,
  octante: undefined,
  nonante: undefined,
  cent: undefined,
  et: undefined,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  seven: 7,
  eight: 8,
  nine: 9,
};
/** Digits weigh their count, a word one: a number is about ten of them. */
const NUMBER_WEIGHT = 7;
const CONTACT_CUE =
  /\b(num|numero|tel|telephone|portable|phone|appelle|appel|whatsapp|sms|texto|joindre|plus)\s?$/;

function isNumberToken(token: string): boolean {
  return /^\d+$/.test(token) || Object.hasOwn(NUMBER_WORDS, token);
}

/** « dix neuf huit… un », « un deux trois… »: single numbers going up or down by one. */
function isCount(run: readonly string[]): boolean {
  const values = run.map((token) => NUMBER_WORDS[token]);
  return values.every((value, i) => {
    if (value === undefined) return false;
    const previous = values[i - 1];
    return i === 0 || (previous !== undefined && Math.abs(value - previous) === 1);
  });
}

function spelledNumber(text: string): string | undefined {
  const tokens = [...text.matchAll(/[\p{L}\d]+/gu)];
  let start = 0;
  while (start < tokens.length) {
    let end = start;
    let weight = 0;
    while (end < tokens.length && isNumberToken(tokens[end]?.[0] ?? '')) {
      const token = tokens[end]?.[0] ?? '';
      weight += /^\d+$/.test(token) ? token.length : 1;
      end += 1;
    }
    const run = tokens.slice(start, end).map((m) => m[0]);
    const hasWord = run.some((token) => !/^\d+$/.test(token));
    if (weight >= NUMBER_WEIGHT && hasWord) {
      const first = run[0] ?? '';
      const before = text.slice(0, tokens[start]?.index ?? 0);
      if (first === 'zero' || first.startsWith('0') || CONTACT_CUE.test(before) || !isCount(run)) {
        return run.join(' ');
      }
    }
    start = Math.max(end, start + 1);
  }
  return undefined;
}

function forbiddenMatch(text: string, term: string): boolean {
  // Whole words only: the disgust « anal » must not block « banal » or « canal ».
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

/**
 * The bubbles read as one message, as the fan reads them: « je suis une » then « IA », a number cut in two, « 1A »
 * or « b0t » (unmasked), a number in words, a forbidden word split or masked. Only what the bubble-by-bubble reading did not already catch.
 */
function wholeMessage(
  bubbles: readonly string[],
  forbidden: readonly string[],
  found: readonly GuardViolation[],
): GuardViolation[] {
  const joined = bubbles.join(' ');
  // Also glued (« je suis un b » then « ot ») and without emoji (« 06 12 34 🙈 56 78 »).
  const glued = bubbles.join('');
  const readings = [joined, glued, joined.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '')].flatMap(
    (text) => [normalise(text), unmask(text)],
  );
  const violations: GuardViolation[] = [];
  const has = (code: GuardCode) => [...found, ...violations].some((v) => v.code === code);
  for (const { code, pattern } of BLOCKING_PATTERNS) {
    if (has(code)) continue;
    const match = readings.map((text) => pattern.exec(text)?.[0]).find((m) => m !== undefined);
    if (match !== undefined) violations.push({ code, severity: 'blocking', match });
  }
  const spelled = readings.map(spelledNumber).find((m) => m !== undefined);
  if (spelled !== undefined && !has('contact_info')) {
    violations.push({ code: 'contact_info', severity: 'blocking', match: spelled });
  }
  const named = new Set(found.filter((v) => v.code === 'forbidden_term').map((v) => v.match));
  for (const term of forbidden) {
    if (!named.has(term) && readings.some((text) => forbiddenMatch(text, term))) {
      violations.push({ code: 'forbidden_term', severity: 'blocking', match: term });
    }
  }
  return violations;
}

export function checkVoiceOutput(bubbles: readonly string[], settings: GuardSettings): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const forbidden = settings.forbiddenTerms.map(normalise).filter((term) => term !== '');

  bubbles.forEach((bubble, bubbleIndex) => {
    const text = normalise(bubble);
    for (const { code, pattern } of BLOCKING_PATTERNS) {
      const match = pattern.exec(text);
      if (match) violations.push({ code, severity: 'blocking', bubbleIndex, match: match[0] });
    }
    const assistant =
      ASSISTANT_OUTPUT.map((pattern) => pattern.exec(bubble)?.[0]).find((m) => m !== undefined) ??
      ASSISTANT_PHRASES.exec(text)?.[0] ??
      recipeMatch(text);
    if (assistant !== undefined) {
      violations.push({ code: 'assistant_output', severity: 'blocking', bubbleIndex, match: assistant });
    }
    for (const term of forbidden) {
      if (forbiddenMatch(text, term)) {
        violations.push({ code: 'forbidden_term', severity: 'blocking', bubbleIndex, match: term });
      }
    }
    if (settings.petNames !== undefined) {
      const hers = settings.petNames.map(normalise);
      const slip = COMMON_PET_NAMES.find(
        (name) => !hers.includes(name) && new RegExp(`(^|[^\\p{L}])${name}($|[^\\p{L}])`, 'u').test(text),
      );
      if (slip !== undefined)
        violations.push({ code: 'pet_name', severity: 'soft', bubbleIndex, match: slip });
    }
    const guilt = GUILT_TRIP.exec(text);
    if (guilt) violations.push({ code: 'guilt_trip', severity: 'soft', bubbleIndex, match: guilt[0] });
    const tic = AI_TICS.map((pattern) => pattern.exec(text)).find((m) => m !== null);
    if (tic) violations.push({ code: 'ai_tic', severity: 'soft', bubbleIndex, match: tic[0] });
    if (bubble.length > settings.maxBubbleChars) {
      violations.push({ code: 'bubble_too_long', severity: 'soft', bubbleIndex });
    }
  });
  violations.push(...wholeMessage(bubbles, forbidden, violations));
  if (bubbles.length > settings.maxBubbles) violations.push({ code: 'too_many_bubbles', severity: 'soft' });
  return violations;
}

export function isBlocked(violations: readonly GuardViolation[]): boolean {
  return violations.some((v) => v.severity === 'blocking');
}
