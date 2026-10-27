# PROPOSED Export quotidien chiffré de la base, hors de Neon
Statut : proposed
Phase : exploitation (ADR 0028, à accepter)
Dépend de : OPS-01 (fait), ADR 0028 acceptée
Branche : task/<id>-daily-encrypted-backup

## Objectif
Chaque nuit, un export complet de la base part chiffré chez un autre fournisseur, l'application voit s'il a réussi, et une restauration a été prouvée.

## Contexte à lire
ADR 0028, ADR 0005, ADR 0027, `docs/runbooks/restore.md`, `docs/runbooks/deploy.md`, `docs/architecture/operations.md` (§ Données), EQ-17 (qui en dépend).

## À faire
- [ ] Image `backup` (`ops/backup/Dockerfile`) : `postgres:16-alpine`, `age`, `rclone`, `supercronic`, utilisateur non root ; script d'export (dump `custom`, relecture `pg_restore --list`, comptes de lignes, chiffrement `age`, envoi, ligne `backup_runs`).
- [ ] Service `backup` dans `docker-compose.prod.yml` ; variables dans `.env.example` sans valeur.
- [ ] Migration `backup_runs` (avec le fil propriétaire de `packages/db`), lecture seule pour `nirvana_app`.
- [ ] Job `images` de la CI : construire l'image, export vers un dossier local sur la base de test, puis `pg_restore` dans une base vide et comparaison des comptes.
- [ ] `restore.md` § B et test trimestriel réécrits selon l'ADR ; `deploy.md` : création du bucket (versioning, verrou d'objets, cycle de vie 30 jours, identifiants sans suppression), génération de la paire `age` sur le PC de Charles, garde des clés de l'application avec la clé privée.
- [ ] Premier essai de restauration sur le PC de Charles (Remote Control), consigné dans `backup_runs`.

## Critères d'acceptation
- La CI prouve la chaîne export → restauration → mêmes comptes de lignes à chaque PR.
- Un dump illisible ou une version de `pg_dump` incompatible donne un échec enregistré, jamais un succès.
- Le serveur ne peut pas déchiffrer un export (pas de clé privée dans Coolify ni dans le dépôt).
- Une restauration réelle a été jouée une fois, avec sa durée.

## Hors périmètre
L'avertissement du Dashboard et la garde de paie (EQ-17) ; l'archive annuelle des factures (EQ-17) ; les médias.

## Notes de session
