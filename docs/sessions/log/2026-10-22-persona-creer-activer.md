# 2026-10-22 — Créatrices : créer une créatrice et activer une version depuis l'écran — done

Fait : `POST /v1/creators` (propriétaire seul, corps `NewCreatorSchema`, 201 `CreatorSummary`) et `POST /v1/creators/:creatorId/persona/versions/:versionId/activate` (propriétaire et créatrice, 200 `PersonaVersionSummary`, 404 `persona_version_not_found`, audit avec l'auteur). L'activation partage `activateRow` avec `pnpm persona:load --activate`. Écran Créatrices : « Ajouter une créatrice » (prénom ou pseudo, fuseau, Europe/Paris par défaut), formulaire d'office quand il n'y a encore aucune créatrice ; en-tête de la persona : « Activer la version X » quand la dernière version n'est pas active, un second clic confirme.
Pas fait : rien.
Fait aussi (remarque d’Extension sur #104) : `save` passe par `safeParse`, un refus devient un échec affiché au lieu de bloquer le bouton.
Décisions : la version active entre dans la version du verrou d'Automatique (Bilan, R-G3, ADR 0019) ; la route d'activation ne touche pas au mode.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓, intégration persona-versions ✓ (8 tests), rendu 1 440 et 400 px contre une API simulée.
