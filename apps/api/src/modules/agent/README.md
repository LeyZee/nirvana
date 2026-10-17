# Module `agent`

**Rôle.** Pipeline sens → cerveau → politique → voix → gardes. Produit un `DraftProposal` à partir d'un `ConversationContext`.

**Peut dépendre de.** fans, persona, media, packages/llm

**Règles propres.** Pas d'I/O plateforme, pas d'écriture en base hors `llm_calls` (via packages/llm). Les règles commerciales et les gardes vivent ici, en code, testées unitairement.

## Composeur

`startDraftComposer` répond à `conversation.respond` (port `DraftComposer` de `conversations`, reconnu par sa forme : `agent` n'importe pas `conversations`). Même chemin que le playground (`composeTurn` : cerveau, voix, gardes), avec la persona du fichier et les réponses corrigées au playground comme exemples de voix. Il n'envoie jamais rien : un brouillon attend toujours un humain.

Retenue (`held`), décidée dans le code :
- `handoff` : média signalé, ou risque `minor_suspected`, `distress`, `self_harm` (`domain/hold.ts`), quoi que propose le cerveau, et avant tout appel à la voix ;
- `no_reply` : le cerveau dit d'attendre ;
- `budget_reached` : plafond du jour ; `llm_unavailable` : aucune clé de voix ou tous les modèles en échec ;
- `guard_blocked` : une garde bloquante sur la réponse écrite.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
