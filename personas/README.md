# personas/

Une persona par créatrice, en YAML versionné (ADR 0010), validée par `PersonaSchema` (`docs/reference/persona-schema.md`).

**Le dépôt ne contient que des placeholders** (`messalina/v0.0.0.yaml`). La vraie persona vit hors dépôt (dépôt privé séparé ou coffre) ; `.gitignore` refuse `v1*.yaml` et au-delà. Vérification : `pnpm persona:validate <fichier>`. Chargement : `pnpm persona:load <fichier> [--creator <id>] [--activate]`. Modification : `docs/playbooks/edit-the-persona.md`.
