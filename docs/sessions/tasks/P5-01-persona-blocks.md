# P5-01 Persona par blocs, compteur de complétion et infos à collecter
Statut : in_progress (ID validé par Charles le 27/10 à 20h37, carte « Les 5 sans capture, désir en tête »)
Phase : 5
Dépend de : écran Persona (`PROPOSED-persona-screen.md`), P0-08 (`PersonaSchema`), P3-02 (mémoire du fan)
Branche : task/P5-01-persona-blocks

## Objectif
Remplacer le texte libre `additional_info` par des blocs guidés que l'agent lit mieux, montrer ce qui manque à la persona, et laisser Charles choisir ce que l'agent cherche à apprendre de chaque fan.

## Contexte à lire
`packages/contracts/src/persona.ts`, `docs/reference/persona-schema.md`, `PROPOSED-persona-screen.md`, `packages/llm/src/schemas.ts` (`FactCategory`), ADR 0010 et 0012, `docs/reference/desirely-analysis.md` (§ Persona).

## Ce que fait Desirely
Profil du modèle en sections : identité, apparence, mode de vie, goûts, personnalité, limites, style d'écriture (longueur, emojis, ponctuation, fautes voulues), exemples de réponses, avec un pourcentage de complétion. Notes du fan : une liste « Notes à collecter » réglable (prénom, âge, ville, métier, situation, goûts…), recopiées dans la note de la plateforme.

## À faire
- [x] Contrat (Bilan) : blocs `lifestyle`, `tastes`, `intimate`, `writing_style` (longueur, emojis préférés et interdits, ponctuation, majuscules), `sample_replies` (dix au plus, inventées pour les fixtures), chacun borné. C'est une nouvelle version du schéma de persona : les versions publiées existantes (`persona_versions`) continuent de se lire, par un parseur tolérant ou une migration de données qui écrit une nouvelle version, jamais par la réécriture d'une version publiée. `additional_info` reste lu le temps de cette transition puis disparaît dans une version suivante (ADR 0012).
- [x] Compteur de complétion : une règle pure qui pèse chaque bloc ; aucun bloc n'est obligatoire et le compteur ne bloque pas l'activation, donc il ne prend aucune couleur. L'écran Persona l'affiche en jauge neutre avec le pourcentage en encre, et dessous la liste de ce qui manque, chaque ligne menant à son bloc.
- [ ] « Infos à collecter » : liste réglable par créatrice, rangée par `FactCategory` ; le cerveau la reçoit comme objectif de KYC (`strategies.kyc.targets`). Le Suivi montre ce qui manque pour ce fan sur une ligne neutre de la fiche du fan du lecteur, à côté de « Limites du fan » (#144) : « À apprendre : ville, métier » ; jamais dans chaque ligne de la liste.
- [ ] Écran (Extension) : les emojis préférés et interdits de `writing_style` sont des données, montrés dans leurs champs en pastilles neutres (la règle « pas d'emoji » vise les textes de l'interface) ; les réponses types sont une liste de champs avec « Ajouter », qui disparaît au dixième, et un aperçu en bulle de la créatrice (`neon-solid`) comme au playground.
- [x] Les prompts lisent les blocs dans des sections délimitées ; aucune règle métier n'y entre (règle 3).

## Critères d'acceptation
- La persona `personas/demo` passe dans les blocs sans perte ; les évals de voix ne régressent pas.
- Une version de persona publiée avant P5-01 se lit toujours, sans réécriture.
- Aucune vraie donnée de créatrice dans le dépôt (ADR 0010).
- Écran : Nuit et Jour, 1 440 et 400 px, mouvement réduit, état « Le serveur ne répond pas ».

## Hors périmètre
La persona réelle de Messa (chez Charles), les vocaux.

## Notes de session
- 28/10 (Agent, PR 1, forme validée par Bilan et Extension) : blocs `lifestyle`, `tastes`, `intimate`, `writing_style`, `sample_replies` dans `PersonaSchema`, tous facultatifs et sans défaut (le `contentHash` des versions publiées ne bouge pas, test épinglé sur `demo/v0.1.0` et `messalina/v0.0.0`) ; `meta.schema` reste 1, `additional_info` reste requis, `schema: 2` sera une ADR à part. Refus d'une persona contradictoire (emoji préféré et interdit, goût aimé et détesté, envie refusée par `limits`). `strategies.kyc.collect` (cases du canevas, ordre gardé), `kycSlotsToCollect`. `personaCompletion` (poids `PERSONA_BLOCK_WEIGHTS`, somme 100, `missing` dans l'ordre de `PERSONA_BLOCKS`), libellés `PERSONA_BLOCK_LABELS`, `PERSONA_OPTIONS.messageLength`, `.capitals`, `.kycSlots`. Côté agent : blocs en sections de la fiche, `kyc_collect` pour le cerveau (prompt 1.9.0), garde `forbidden_term` sur les emojis interdits, `sampleReplyFaults` refuse à l'enregistrement une réponse type qu'une garde dure bloquerait (422 `persona_sample_reply_unprocessable`). `personas/demo/v0.2.0.yaml` : la démo rangée en blocs, lue par défaut par le playground et les évals. Restent : l'écran des blocs et la jauge (Extension) ; « À apprendre » dans le Suivi, qui demande une donnée par fan des cases encore vides (API à poser avec Bilan, puis écran d'Extension) ; les évals de voix sur v0.2.0 avec une clé xAI.
