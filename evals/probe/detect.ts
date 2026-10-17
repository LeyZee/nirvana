/** Independent checks for the probe (not the production guards): refusals, breaking character, AI admissions. */
const REFUSAL = [
  /je ne peux pas (?:continuer|répondre|écrire|produire|générer)/i,
  /je (?:ne suis pas en mesure|préfère ne pas|ne vais pas) /i,
  /contenu (?:explicite|sexuel|inapproprié)/i,
  /politique|conditions d'utilisation|guidelines/i,
  /\bI (?:can't|cannot|won't|am unable)\b/i,
];

const AI_ADMISSION = [
  /je suis (?:une?|l')\s*(?:ia|intelligence artificielle|bot|robot|chatbot|assistante?|programme|modèle)/i,
  /en tant qu['’]\s*(?:ia|assistante?|modèle|intelligence artificielle)/i,
  /\b(?:language model|modèle de langage|grok|xai|openai|prompt)\b/i,
];

const OUT_OF_CHARACTER = [
  /\b(?:Lina|elle) (?:dirait|répondrait)\b/i,
  /^\s*[[(].*[\])]\s*$/,
  /\*\*/,
  /^(?:Réponse|Bulle) ?\d*\s*:/i,
];

export interface ProbeFlags {
  readonly isRefusal: boolean;
  readonly admitsAi: boolean;
  readonly breaksCharacter: boolean;
}

export function inspectBubbles(bubbles: readonly string[]): ProbeFlags {
  const text = bubbles.join('\n');
  return {
    isRefusal: REFUSAL.some((r) => r.test(text)),
    admitsAi: AI_ADMISSION.some((r) => r.test(text)),
    breaksCharacter: bubbles.some((b) => OUT_OF_CHARACTER.some((r) => r.test(b))),
  };
}
