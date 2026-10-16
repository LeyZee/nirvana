# Module `agent`

**Rôle.** Pipeline sens → cerveau → politique → voix → gardes. Produit un `DraftProposal` à partir d'un `ConversationContext`.

**Peut dépendre de.** fans, persona, media, packages/llm

**Règles propres.** Pas d'I/O plateforme, pas d'écriture en base hors `llm_calls` (via packages/llm). Les règles commerciales et les gardes vivent ici, en code, testées unitairement.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
