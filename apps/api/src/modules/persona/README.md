# Module `persona`

**Rôle.** Chargement, validation (Zod) et versionnage des personas depuis `personas/*.yaml` vers `persona_versions`.

**Peut dépendre de.** aucun

**Règles propres.** Propriétaire de `creators` et de `persona_versions`. Routes : `GET /v1/creators`, `POST /v1/creators` (propriétaire seul, `audit_log` `creator.create` avec l’auteur), `GET /v1/creators/:creatorId/persona` (ses versions, la plus récente en entier), `POST /v1/creators/:creatorId/persona/versions` (nouvelle version, jamais active ; 409 `persona_version_conflict` si une autre version est arrivée depuis `basedOn` ou si le numéro existe) et `POST /v1/creators/:creatorId/persona/versions/:versionId/activate` (propriétaire et créatrice : sa seule version active, `audit_log` `persona_version.activate` avec l'auteur ; 404 `persona_version_not_found`). Le verrou d'Automatique tient compte de la version active (ADR 0019, porté par Bilan). Commandes : `pnpm persona:validate <fichier>` et `pnpm persona:load <fichier> [--creator <id>] [--activate]` (une seule version active par créatrice, `audit_log`, jamais de contenu de persona dans les journaux). Une version dont une réponse type (`sample_replies`, P5-01) serait bloquée par une garde dure de ses réponses est refusée avant toute écriture, depuis l'écran comme depuis `pnpm persona:load` (422 `persona_sample_reply_unprocessable`, `details.faults` : place et code de garde, jamais le texte) ; la vérification est la fonction `sampleReplyFaults` d'`agent`, passée par la racine de composition (`sampleReplyFaults` dans les dépendances). Erreurs du module : `domain/errors.ts`. Jamais de logique de génération ici.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
