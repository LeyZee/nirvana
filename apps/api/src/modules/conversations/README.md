# Module `conversations`

**Rôle.** Ingestion idempotente des messages, machine d'état de la conversation, journal d'événements, files par conversation, drafts et envoi vérifié.

**Peut dépendre de.** fans, persona, agent, supervision, connectors (port)

**Règles propres.** Propriétaire des tables `conversations`, `messages`, `conversation_events`, `drafts`.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
