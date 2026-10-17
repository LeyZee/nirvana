import { unmask } from './normalise';

/**
 * Traps a fan sets to catch a machine (docs/architecture/ai-engine.md, « Les pièges »). Pure code, run on
 * every fan message and on the text read in his media, before the brain: the brain catches the subtle ones,
 * this catches the known shapes whatever the model says.
 */
type InjectionKind = 'override' | 'role_change' | 'prompt_extraction' | 'system_markup' | 'off_topic_task';

export interface InjectionSignal {
  readonly kind: InjectionKind;
  readonly match: string;
}

// « montre-moi », « montre moi », « montremoi » once normalised.
const ME = String.raw`(?:[- ]?(?:moi|nous))?`;
// What a machine has and a girl has not. Dominant play uses « règles », « consignes », « limites »,
// « programme » and « soumise » every night: none of them is a trap without one of these objects.
const MACHINE = String.raw`(?:une? )?(?:ia|intelligence artificielle|assistante?|chatgpt|gpt|grok|gemini|robot|bot|chatbot|programme informatique|modele de langage|llm)`;

const PATTERNS: readonly { kind: InjectionKind; pattern: RegExp }[] = [
  {
    kind: 'override',
    pattern: new RegExp(
      String.raw`\b(?:ignore[rsz]?|oublie[rsz]?|zappe[rsz]?|efface[rsz]?|ne tiens? (?:plus |pas )?compte d?e?)\s?(?:de )?(?:toutes? |tous )?(?:tes|les|vos|ses|ces) (?:precedentes? |anciennes? |premieres? )?(?:instructions?|consignes? (?:precedentes|initiales|de base|systeme)|directives?|programmation|prompt|filtres?|restrictions?)\b`,
    ),
  },
  {
    kind: 'override',
    pattern:
      /\b(?:ignore|disregard|forget) (?:all |any |the |your )?(?:previous |prior |above )?(?:instructions|prompts?|guidelines|system message)\b|\bdo anything now\b|\bjailbreak\b|\bmode (?:developpeur|developer|debug|admin|dan|sans (?:filtre|censure))\b|\bnouvelles? (?:instructions|directives) (?:systeme|pour l'ia|pour le bot)\b/,
  },
  {
    kind: 'role_change',
    pattern: new RegExp(
      String.raw`\b(?:tu es|t'es|tu deviens|tu n'es plus) (?:maintenant |desormais |a present )${MACHINE}\b|\b(?:a partir de maintenant|desormais),? tu (?:es|deviens|reponds comme) ${MACHINE}\b|\b(?:fais|joue|imagine) (?:comme si tu etais |semblant d'etre |le role d['e] ?)${MACHINE}\b|\b(?:agis|reponds|parle|comporte-toi|comporte toi) (?:comme|en tant qu[e'] ?) ?(?:${MACHINE}|(?:une? )?(?:developpeu?r|developpeuse|traducteur|traductrice))\b|\b(?:pretend (?:to be|you are)|act as an?|you are now)\b`,
    ),
  },
  {
    kind: 'prompt_extraction',
    pattern: new RegExp(
      String.raw`\b(?:repete|recopie|affiche|montre|donne|ecris|revele|dis|envoie|colle|lis)${ME} (?:mot pour mot |exactement )?(?:ton|tes|le|les|ta|la) (?:prompt|programmation|configuration|message (?:systeme|system)|premier message|instructions? (?:initiales?|systeme|de base|d'origine|cachees?))\b|\b(?:repete|recopie|affiche|ecris)${ME} mot pour mot (?:tes|les) (?:instructions|consignes|regles)\b|\bsystem ?prompt\b|\bprompt (?:systeme|system)\b|\b(?:quel|quelle|quels|quelles) (?:sont|est) (?:tes|ton|ta) (?:prompt|programmation|instructions (?:initiales|systeme|cachees))\b`,
    ),
  },
  {
    kind: 'system_markup',
    pattern:
      /<\|?(?:im_start|im_end|system|endoftext)\|?>|\[\/?inst\]|<<\/?sys>>|###\s?(?:system|instruction|assistant)|^\s*(?:system|assistant|developer)\s?:|<\/?(?:fan_message|brief|fan_notes|system|instructions?)>/m,
  },
  {
    kind: 'off_topic_task',
    pattern: new RegExp(
      String.raw`\b(?:donne|ecris|envoie|file|redige|propose|explique|dis)${ME} (?:la|une|ta|ton) recette\b|\b(?:c'est quoi|quelle est) (?:la|ta) recette (?:de|du|des|d')`,
    ),
  },
  {
    kind: 'off_topic_task',
    pattern: new RegExp(
      String.raw`\b(?:ecris|code|programme|genere|fais|redige|ecrire|coder)${ME} (?:un|une|du|le|la|mon|ma) (?:code|script en|programme informatique|fonction|algorithme|requete sql|dissertation|redaction|lettre de motivation|cv|article|expose|commentaire de texte)\b|\ben (?:python|javascript|typescript|java|c\+\+|php|sql|html|rust)\b|\btradui[st]${ME}\b|\bresume${ME} (?:ce|cet|cette|le|les) (?:texte|article|livre|document|pdf)\b|\bcombien (?:font|fait) \d+ ?(?:\+|-|x|\*|\/|fois|plus|moins|divise par) ?\d|\b(?:fais|aide)${ME} (?:a faire )?(?:mes|mon) (?:devoirs?|exercices?|dm)\b|\b(?:write|give)(?: me)? (?:a|an|the|some) (?:recipe|code|script|essay)\b`,
    ),
  },
];

export function detectInjection(text: string): InjectionSignal[] {
  const unmasked = unmask(text);
  const signals: InjectionSignal[] = [];
  for (const { kind, pattern } of PATTERNS) {
    const match = pattern.exec(unmasked);
    if (match && !signals.some((s) => s.kind === kind)) signals.push({ kind, match: match[0] });
  }
  return signals;
}
