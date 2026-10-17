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

const PATTERNS: readonly { kind: InjectionKind; pattern: RegExp }[] = [
  {
    kind: 'override',
    pattern:
      /\b(ignore[rsz]?|oublie[rsz]?|zappe[rsz]?|efface[rsz]?|ne tiens? (plus )?(pas )?compte d?e?)\s?(de )?(toutes? |tous )?(tes|les|vos|ses|ces|mes) (precedentes? |anciennes? )?(instructions?|consignes?|regles?|directives?|programmation|limites|filtres?|restrictions?)\b/,
  },
  {
    kind: 'override',
    pattern:
      /\b(ignore|disregard|forget) (all |any |the |your )?(previous |prior |above )?(instructions|rules|prompts?|guidelines)\b|\bdo anything now\b|\bjailbreak\b|\bmode (developpeur|developer|debug|admin|sans (filtre|limite|censure))\b|\bnouvelles? (instructions|consignes|regles)\b/,
  },
  {
    kind: 'role_change',
    pattern:
      /\b(tu es|t'es|tu deviens) (maintenant|desormais|a present)\b|\b(a partir de maintenant|desormais),? tu (es|dois|vas|reponds)\b|\b(fais|joue|imagine) (comme si tu etais|semblant d'etre|le role d['e]) ?(une? )?(ia|assistante?|chatgpt|gpt|grok|robot|bot|programme|modele)\b|\b(agis|reponds|parle|comporte-toi) (comme|en tant qu[e']) ?(une? )?(ia|assistante?|chatgpt|gpt|grok|robot|bot|programme|modele|developpeu?r|traducteur|traductrice|prof(esseur)?)\b|\b(pretend (to be|you are)|act as an?|you are now)\b/,
  },
  {
    kind: 'prompt_extraction',
    pattern:
      /\b(repete|recopie|affiche|montre|donne|ecris|revele|dis|envoie|colle|lis)-?(moi|nous)? (mot pour mot |exactement )?(ton|tes|le|les|ta|la) (prompt|instructions?|consignes?|regles|message (systeme|system)|premier message|programmation|configuration|fiche)\b|\bsystem ?prompt\b|\bprompt (systeme|system)\b|\b(quel|quelle|quels|quelles) (sont|est) (tes|ton|ta) (instructions|consignes|prompt|regles|programmation)\b/,
  },
  {
    kind: 'system_markup',
    pattern:
      /<\|?(im_start|im_end|system|endoftext)\|?>|\[\/?inst\]|<<\/?sys>>|###\s?(system|instruction|assistant)|^\s*(system|assistant|developer)\s?:|<\/?(fan_message|brief|fan_notes|system|instructions?)>/m,
  },
  {
    kind: 'off_topic_task',
    pattern:
      /\b(donne|ecris|envoie|file|redige|propose|explique|dis)-?(moi|nous)? (la|une|ta|ton) recette\b|\b(c'est quoi|quelle est) (la|ta) recette (de|du|des|d')/,
  },
  {
    kind: 'off_topic_task',
    pattern:
      /\b(ecris|code|programme|genere|fais|redige|ecrire|coder)-?(moi|nous)? (un|une|du|le|la|mon|ma) (code|script|programme|fonction|algorithme|requete sql|poeme|dissertation|essai|redaction|lettre de motivation|cv|article|expose|commentaire de texte)\b|\ben (python|javascript|typescript|java|c\+\+|php|sql|html|rust)\b|\btradui[st]-?(moi|nous)?\b|\bresume-?(moi|nous)? (ce|cet|cette|le|les) (texte|article|livre|document|pdf)\b|\bcombien (font|fait) \d|\b(fais|aide)-?(moi)? (a faire )?(mes|mon) (devoirs?|exercices?|dm)\b|\b(write|give)( me)? (a|an|the|some) (recipe|code|script|poem|essay)\b/,
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
