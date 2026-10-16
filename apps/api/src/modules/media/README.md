# Module `media`

**Rôle.** Catalogue de médias, descriptions au vocabulaire Nirvana (hérité d'OnlyScript), extraction de frames et transcription (ffmpeg, fourni par l'image Docker, voir `operations.md`), historique d'envoi par fan.

**Peut dépendre de.** packages/llm (rôle sense)

**Règles propres.** Propriétaire de `media_assets`, `media_descriptions`, `media_sends`.

## Structure

- `domain/` : types, règles pures, machines d'état. Zéro I/O, zéro import de framework.
- `application/` : cas d'usage (commandes, requêtes, handlers de jobs). Orchestrent le domaine et les ports.
- `infra/` : implémentations (Drizzle, HTTP Fastify, jobs Graphile, clients externes).
- `index.ts` : **seule** porte d'entrée publique du module. Tout ce qui n'y est pas exporté est privé.

Voir `docs/architecture/modules.md` pour les règles communes et `docs/playbooks/add-a-module.md` pour en créer un.
