# Restauration de la base

Deux mécanismes : **PITR Neon** (retour à un instant T, rapide) et **export chiffré quotidien** hors Neon (si Neon est indisponible ou le compte compromis).

## A. Retour à un instant T (erreur humaine, migration ratée)

1. Kill switch global.
2. Neon → projet → Restore → choisir l'instant (avant l'erreur). Neon crée une branche restaurée.
3. Vérifier sur la branche (`psql`) : les données attendues sont là.
4. Deux options : promouvoir la branche en principale (Neon), ou copier les tables touchées de la branche vers la principale (si l'erreur est localisée).
5. Mettre à jour `DATABASE_URL` si la branche a changé, redémarrer, `/ready`.
6. **Réconcilier** : `connector.reconcile` immédiat pour ré-ingérer les messages reçus entre T et maintenant ; vérifier qu'aucun draft `approved`/`sending` d'avant T ne sera renvoyé (les marquer `expired`).
7. Rallumer par paliers (`incident.md` §4).

## B. Depuis l'export (perte de Neon)

1. Créer une base vierge (Neon ou Postgres local), appliquer les migrations : `pnpm db:migrate`.
2. Récupérer le dernier export (`s3://<bucket>/backups/nirvana-<date>.sql.gz.age`), déchiffrer : `age -d -i <clé> … | gunzip > dump.sql`.
3. `psql "$DATABASE_URL" < dump.sql` (le dump est produit en `--data-only --disable-triggers` sur le schéma applicatif).
4. Rejouer les secrets (`SESSION_ENCRYPTION_KEYS` doit contenir la clé qui a chiffré les sessions du dump).
5. Étapes A.5 à A.7.

## Test trimestriel

Tous les 3 mois, une session `H-xx` exécute la procédure B sur une base jetable, mesure le temps, vérifie que l'application démarre et qu'une conversation s'affiche. Résultat dans le LOG. **Une sauvegarde non testée n'existe pas.**
