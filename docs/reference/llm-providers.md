# Fournisseurs LLM : état des lieux

Mis à jour le 2026-10-17. À re-vérifier à chaque changement de fournisseur (playbook `add-an-llm-provider.md`). Les faits viennent des pages publiques des fournisseurs ; les prix sont indicatifs.

| Fournisseur / modèle | Entrées | Contexte | Contenu adulte (politique) | Transparence IA exigée | Rôle envisagé | Notes |
|---|---|---|---|---|---|---|
| **xAI Grok 4.7** (`grok-4.7`, sorti le 2026-09-21) | texte, images ; **vidéo native non confirmée** (à tester avec la clé) | 500 k | non interdit entre adultes (AUP 2026-08-14) | **oui** | sense, brain, voice, judge : **défaut** (décision de Charles, 17/10) | ~2 $/M entrée, 0,50 $/M en cache, 6 $/M sortie (sources tierces, à confirmer sur docs.x.ai). Test express « tient-il le rôle en sexting ? » : `pnpm probe`. |
| xAI Grok 4.3 (GA 2026-05-06) | texte, images, **vidéo native** (`video_url`), | 1 M | non interdit entre adultes (AUP 2026-08-14) | **oui** (« not being transparent regarding your use of AI » interdit) | repli `sense` pour la vidéo | tarif annoncé ~1,25 $/M entrée, 2,50 $/M sortie (source tierce, à confirmer sur docs.x.ai). Meilleur score agrégé des candidats. |
| **Mistral Large / Medium 3.5** | texte, images (Pixtral) | 128 k | politique muette (2026-06-11) | non précisé | brain, voice (challenger), judge | français natif, hébergement UE. Scores agrégés nettement sous Grok 4.20 : **challenger**, pas défaut. |
| **Venice** (open-weight hébergés, ex. Qwen3-VL 235B) | texte, images | variable | autorisé (roleplay adulte) | non | voice de repli (sans filtre), sense de repli | qualité du français à évaluer ; pas de vidéo native. |
| **Google Gemini 2.5 Flash** (Vertex, `BLOCK_NONE`) | texte, images, vidéo, audio | 1 M | **interdit** « for sexual gratification » | — | sense **uniquement** (analyse), repli | prouvé dans OnlyScript ; risque de compte si usage génératif. |
| **Anthropic Claude** | texte, images, PDF | 1 M | refuse l'explicite | — | hors runtime ; architecture et code (sessions Opus) | pas de vidéo native. |
| **OpenAI GPT** | texte, images, vidéo (selon modèle) | — | refuse l'explicite | — | hors runtime | — |
| Whisper / équivalent | audio | — | — | — | transcription des vocaux (sense audio) | si Grok ne couvre pas l'audio seul. |

## Ce que cela implique

- **Grok 4.7 d'abord** (Grok 4.3 reste le repli `sense` si la vidéo de 4.7 ne marche pas), évalué sur les trois rôles en P3 ; Mistral comme challenger sur `brain`/`voice` ; Venice comme repli sans filtre ; Gemini comme repli `sense`.
- La contrainte de transparence de xAI est connue et acceptée par Charles (ADR 0012, redit le 17/10 : il prend le risque) ; elle motive un repli fonctionnel (Venice ou Mistral) prêt à prendre `voice` si xAI coupait l'accès.
- Pas de dépendance à un seul fournisseur : la passerelle (ADR 0009) et les évals rendent le changement peu coûteux.
