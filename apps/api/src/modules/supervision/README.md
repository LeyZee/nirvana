# Module `supervision`

**Rôle.** Approbation des drafts, prise en main humaine, notifications (dashboard SSE, Web Push), interrupteurs d'arrêt, journal des décisions.

**Peut dépendre de.** conversations, fans

**Règles propres.** Propriétaire de `notifications` et `kill_switches`. Les décisions d'approbation sont des événements du journal des conversations (`draft_approved`, `draft_rejected`), pas une table. Réagit aux événements de l'outbox `domain_events` (`draft_created`) au lieu d'être appelé par `conversations`.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
