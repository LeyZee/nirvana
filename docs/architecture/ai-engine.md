# Moteur IA : sens, cerveau, voix, politique, gardes

Dernière revue : 2026-10-17 (Grok 4.7, P3-01). Décisions : ADR 0009, 0012.

## Les rôles

| Rôle | Entrée | Sortie | Fournisseur par défaut (à confirmer par évals, P3) | Repli |
|---|---|---|---|---|
| **sense** | image / vidéo / audio (créatrice ou fan) | `MediaDescription` (vocabulaire Nirvana, Zod) | xAI `grok-4.7` (image ; vidéo native à confirmer, sinon images clés ou `grok-4.3`) | Gemini 2.5 Flash sur Vertex (BLOCK_NONE, prouvé dans OnlyScript) ; Qwen3-VL hébergé ; audio : Whisper |
| **brain** | `ConversationContext` | `Brief` (Zod strict) | xAI `grok-4.7` | Mistral Large |
| **voice** | `ConversationContext` + `Decision` | `bubbles[]` | xAI `grok-4.7` | Venice (open-weight sans filtre), Mistral |
| **judge** | transcript + rubrique | scores (Zod) | xAI `grok-4.7` ou Mistral | hors production |

Pourquoi trois rôles : fournisseur changeable rôle par rôle, cerveau testable sur des décisions (pas des paragraphes), voix libre d'écrire sans porter de logique.

Faits sur les politiques des fournisseurs (vérifiés le 16/10/2026) : xAI n'interdit pas le contenu adulte entre adultes mais interdit « *not being transparent regarding your use of AI* » ; Mistral est muet sur le contenu adulte ; Google interdit le contenu sexuel « for sexual gratification » (risque de compte, usage réservé à l'analyse) ; Claude et GPT sont hors runtime. Ces faits se re-vérifient à chaque changement de fournisseur.

## La passerelle `LlmGateway` (packages/llm)

```ts
interface LlmGateway {
  brain(input: ConversationInput): Promise<Result<LlmSuccess<Brief>, LlmFailure>>;
  voice(input: VoiceInput): Promise<Result<LlmSuccess<VoiceOutput>, LlmFailure>>;
  health(): HealthReport;                       // panneau « Modèles IA »
  testConnection(provider): Promise<ConnectionTest>;
  // sense, judge : à venir (P3-xx)
}
```

- Implémentation sur le Vercel AI SDK 7 (`generateText` + `Output.object` avec schémas Zod, providers `@ai-sdk/xai`, `@ai-sdk/mistral`, `@ai-sdk/google-vertex`, `@ai-sdk/openai-compatible` pour Venice/Novita). Le reste du code n'importe jamais le SDK : seulement `LlmGateway`.
- Config par rôle : `{ provider, model, temperature, maxOutputTokens, timeoutMs, fallback?: {provider, model} }` (`packages/llm/src/config.ts`, `DEFAULT_LLM_CONFIG`), surchargée plus tard par `CreatorSettings.llm`.
- Chaque appel : timeout, retry borné (2) sur erreurs transitoires, repli sur le fournisseur de secours si refus (`refused`) ou indisponibilité, journal `LlmCallLog` (en mémoire ou JSONL en attendant la table `llm_calls` de P0-03, jamais de contenu de message) + trace Langfuse, coût calculé depuis le catalogue daté (`packages/llm/src/catalog.ts`).
- Sortie invalide (Zod) : une relance avec l'erreur en contexte, puis échec propre.
- Cache : `sense` est mis en cache par `sha256(média) + vocabulary_version + model` ; on ne décrit jamais deux fois le même média.
- Plafonds : tokens par appel, appels par conversation/heure, budget quotidien par créatrice (coupe-circuit → copilote + alerte).

## Santé (panneau « Modèles IA »)

`health()` calcule depuis le journal, pour chaque rôle : modèle actif et repli, présence de la clé (jamais sa valeur), repli en service, dernier succès, dernière erreur typée, latence p50/p95 et taux d'erreurs sur une heure, coût du jour ; et pour l'ensemble : état (`ok`, `degraded`, `down`) et coût du jour face au budget (`dailyBudgetUsd`). `testConnection(provider)` fait un appel court.

## Prompts

`packages/llm/prompts/<role>/<name>.md` avec en-tête YAML. Versionnés, hachés, le hash est sur chaque draft. Règles : pas de logique métier dans un prompt ; variables par template strict ; contenu non fiable (messages fan, descriptions de médias fan) enveloppé par `wrapUntrusted()` dans un bloc délimité que le prompt système déclare comme données.

## Contexte (budget de tokens)

`assembleContext` construit l'entrée du cerveau et de la voix avec un budget explicite (`CreatorSettings.llm.contextBudgetTokens`, défaut 12 000) :

1. Persona (sections pertinentes : style, limites, kinks/dégoûts, exemples) — toujours.
2. Résumé fan (dernière version) — toujours.
3. Faits actifs, triés catégorie puis confiance — jusqu'à 40.
4. Derniers messages, du plus récent au plus ancien, jusqu'au budget — jamais l'historique entier.
5. Médias entrants décrits (description, pas le fichier).
6. État : cooldowns, slots KYC manquants, heure locale, script actif (P6).

## Le Brief (sortie du cerveau)

```ts
Brief {
  intent: 'small_talk'|'kyc_answer'|'flirt'|'sexting'|'media_reaction'|'asks_for_media'|'price_objection'|
          'asks_if_bot'|'asks_to_meet'|'asks_personal_contact'|'distress'|'complaint'|'other';
  sentiment: 'positive'|'neutral'|'negative'|'aroused'|'frustrated';
  factsProposed: { category, key, value, kind: 'declared'|'inferred', confidence }[];
  kycMissing: KycSlot[];
  risks: ('minor_suspected'|'distress'|'meet_request'|'off_platform_payment'|'dispute'|'harassment'|'self_harm'|'money_trouble')[];
  action: 'reply'|'offer'|'wait'|'follow_up'|'handoff';
  replyBrief: string;           // ce qu'il faut dire, en 1-3 phrases, pas le texte final
  toneHints: string[];
  // à venir : suggestedKycQuestion, followUpInMinutes
}
```

## La politique (code pur, `modules/agent/domain/policy.ts`)

Entrée : contexte + brief. Sortie : `Decision` + `policy_trace`. Ordre d'évaluation fixe :

1. Risques bloquants → `handoff` (non contournable, même en auto).
2. Interrupteurs, mode, session → `wait`.
3. Horaires de la persona (avec jitter) → `wait` avec `runAt`.
4. `asks_if_bot` → selon `identity_policy` : `stay_in_character` (défaut, ADR 0012) donne un `reply_brief` de déflexion en personnage ; `deflect_and_handoff` ; `disclose`.
5. Offre : autorisée seulement si cooldowns expirés, KYC minimal atteint, média disponible et jamais vendu à ce fan, prix depuis `offers` (P6 ; avant P6, `offer` → `reply`).
6. KYC : au plus une question, seulement si `intent` s'y prête et pas de question dans les 3 derniers envois.
7. Relance : bornée par `CreatorSettings.followUp` (délai, max par jour).

Chaque règle est une fonction testée unitairement avec cas nominal, limite, adversarial.

## Les gardes (code pur, `modules/agent/domain/guards.ts`)

Après la voix, sur le texte final : dégoûts et mots interdits (persona, liste normalisée avec variantes), anti-répétition (similarité avec les N derniers envois), longueur par bulle, mention d'argent/prix hors offre, mention d'IA/prompt/système/assistant, fuite d'un autre fan (noms/faits d'un autre fan dans le contexte ne doivent pas apparaître), URL/téléphone/email, langue attendue. Une violation `blocking` interdit l'envoi ; une violation `soft` déclenche une régénération puis laisse passer avec trace.

## Humanisation (envoi)

Délai de première réponse dans une fenêtre dépendant de l'heure et de la persona ; « temps de frappe » ≈ 40-60 mots/min avec jitter ; bulles séparées ; `setTyping` si la plateforme l'expose ; jamais deux réponses identiques à deux fans ; horaires de vie avec variations hebdomadaires.

## Évaluations

Promptfoo dans `evals/` : scénarios (30 au départ), rubrique à 8 critères (naturel du français, spontanéité, cohérence persona, pertinence, écoute, continuité, mémoire, absence de répétition) + critères de sécurité (pas de vente inappropriée, respect des limites, gardes). Comparaison de fournisseurs côte à côte, seuils en CI sur `smoke`. Détail : `docs/playbooks/write-an-eval.md`.
