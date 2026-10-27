# Module `backups`

**Rôle.** Ce que l'application sait de l'export quotidien chiffré de la base (ADR 0028 § 5, OPS-02) : l'état des sauvegardes pour le Dashboard du propriétaire, et l'alerte quand un export manque depuis 26 h. L'export lui-même tourne hors de l'application, dans le service `backup` (`ops/db-export/`).

**Peut dépendre de.** aucun module métier (feuille).

**Tables.** Lit `backup_runs` avec le rôle de l'application (`SELECT` seul, hors RLS : aucune donnée de créatrice), chaque ligne passée par Zod parce qu'un script l'écrit. N'écrit jamais `backup_runs`. Écrit dans `domain_events` l'événement `backup_overdue`, sans créatrice, avec le rôle admin (comme `budget_threshold_crossed`).

**Règles propres** (`domain/status.ts`, testées) :

- `ok` si un export a réussi dans les 26 dernières heures, `overdue` au-delà, `never` si aucun n'a jamais réussi ;
- l'alerte part pour `overdue`, et pour `never` seulement en production (une base de développement n'a pas de service `backup`) ;
- au plus une alerte par jour, à l'heure de Paris, tant que ça dure : elle revient chaque matin jusqu'au prochain export réussi.

**Routes** (montées sous `/v1`, contrat `packages/contracts/src/backups.ts`) : `GET /backups/status`, propriétaire seul. La réponse ne donne ni le chemin du fichier, ni le bucket, ni l'empreinte.

**Job.** `backups.check`, toutes les heures (`crontab.ts`). Le message Telegram vient du module `telegram` (sujet « important »).

## Structure

- `domain/` : la règle des 26 h, le jour de Paris, les ports. Zéro I/O.
- `application/` : l'état pour la route, le contrôle pour le job.
- `infra/` : lecture Drizzle, publication de l'événement, route Fastify.
- `index.ts` : **seule** porte d'entrée publique du module.

Voir `docs/architecture/modules.md` pour les règles communes.
