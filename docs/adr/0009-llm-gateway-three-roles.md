# 0009. Passerelle LLM unique, trois rôles, règles métier dans le code

Statut : accepted
Date : 2026-10-16

Mises à jour du 2026-10-17, la décision ne change pas :
- `voice`, `brain` et `judge` passent sur Grok 4.7 (`grok-4.7`, sorti le 21/09/2026) à la demande de Charles, avec repli Mistral Large ; les évals le comparent à Grok 4.3. Le repli ne sert que si une clé Mistral est fournie.
- `sense` passe sur Gemini 3.8 Flash, avec bascule sur Grok 4.7 : voir l'ADR 0017. Aucun modèle de chat xAI ne lit la vidéo ; Grok n'accepte que des images JPEG ou PNG (`docs/reference/llm-providers.md`).

## Contexte

Claude et GPT refusent le contenu explicite ; les candidats étaient, au 16/10, xAI (Grok 4.3 ; on le croyait alors lecteur de vidéo), Mistral, Venice/open-weights, Gemini (analyse seulement). Les fournisseurs changent, les politiques aussi. OnlyScript a montré qu'un vocabulaire de description de médias structuré et des règles codées (dégoûts garantis par le code) valent mieux que de tout demander au prompt.

## Décision

- **Un seul point d'entrée** `LlmGateway` (`packages/llm`) sur le Vercel AI SDK ; le reste du code n'importe jamais un SDK de fournisseur.
- **Trois rôles** configurables indépendamment : `sense` (média → `MediaDescription`), `brain` (contexte → `Brief` structuré), `voice` (brief + décision → bulles). Plus `judge` pour les évals.
- Sorties **structurées et validées par Zod** (`generateObject`) pour `sense` et `brain` ; relance une fois sur sortie invalide.
- **Les règles métier vivent dans le code** (`agent/domain/policy.ts`, `guards.ts`) : risques, cooldowns, droits d'envoi, prix, dégoûts, identité, anti-répétition. Les prompts reçoivent des décisions et des faits, pas des règles à interpréter.
- Chaque appel est journalisé (`llm_calls`) et tracé (Langfuse) ; les prompts sont versionnés et hachés ; le hash est sur chaque draft.
- Repli par rôle (`fallback`), timeouts, budgets et coupe-circuit par créatrice.
- Le contenu non fiable (messages fan, descriptions de médias fan) est délimité par `wrapUntrusted()`.

## Conséquences

- Changer de fournisseur = changer une config et relancer les évals ; pas de réécriture.
- Le cerveau est testable sur des décisions ; la voix sur du style ; la politique sur des cas unitaires.
- Coût : trois appels au lieu d'un par réponse (latence et prix). Acceptable : la latence cible est de quelques dizaines de secondes de toute façon (humanisation). Une variante « brain+voice fusionnés » pourra être évaluée si le coût le justifie, derrière la même passerelle.

## Alternatives rejetées

- **Un seul prompt géant** qui décide et écrit : impossible à tester, à faire évoluer, et chaque règle métier devient un vœu pieux.
- **LangChain / LangGraph** : abstractions lourdes pour un pipeline linéaire ; le SDK Vercel suffit et reste visible.
- **Fournisseur unique câblé en dur** : les politiques des fournisseurs changent ; le projet doit survivre à un refus.
