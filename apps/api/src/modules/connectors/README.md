# Module `connectors`

**Rôle.** Port `PlatformConnector` et ses adaptateurs (`RevealApiConnector`, `FakeConnector`, plus tard `NirvanaPlatformConnector`). Seul module autorisé à parler à une plateforme externe.

**Peut dépendre de.** conversations (événements entrants uniquement via `IngestMessage`)

**Règles propres.** Aucun autre module n'importe un adaptateur directement : tout passe par le port.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
