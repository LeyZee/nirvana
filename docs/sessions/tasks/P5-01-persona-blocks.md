# P5-01 Persona par blocs, compteur de complétion et infos à collecter
Statut : todo (ID validé par Charles le 27/10 à 20h37, carte « Les 5 sans capture, désir en tête »)
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
- [ ] Contrat (Bilan) : blocs `lifestyle`, `tastes`, `intimate`, `writing_style` (longueur, emojis préférés et interdits, ponctuation, majuscules), `sample_replies` (dix au plus, inventées pour les fixtures), chacun borné ; `additional_info` reste lu le temps de la migration de la persona puis disparaît dans une version suivante (ADR 0012).
- [ ] Compteur de complétion : une règle pure qui pèse chaque bloc ; l'écran Persona l'affiche, sans bloquer l'activation.
- [ ] « Infos à collecter » : liste réglable par créatrice, rangée par `FactCategory` ; le cerveau la reçoit comme objectif de KYC (`strategies.kyc.targets`) et l'écran Suivi montre ce qui manque pour ce fan.
- [ ] Les prompts lisent les blocs dans des sections délimitées ; aucune règle métier n'y entre (règle 3).

## Critères d'acceptation
- La persona `personas/demo` passe dans les blocs sans perte ; les évals de voix ne régressent pas.
- Aucune vraie donnée de créatrice dans le dépôt (ADR 0010).

## Hors périmètre
La persona réelle de Messa (chez Charles), les vocaux.

## Notes de session
