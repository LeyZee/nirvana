# 2026-10-17 — Table des notes d'entraînement (demande du fil agent via le coordinateur) — done
Fait : table `calibration_ratings` (migration `0005`), sous RLS FORCE comme toute table de créatrice. Un trigger la rend append-only : seule la purge de `moment` est permise (`moment` à null avec `moment_purged_at`, contrainte qui lie les deux), et aucun DELETE. Index pour le taux par version et pour la lecture récente. Le test RLS couvre isolation, refus de modification, refus de suppression et purge.
Pas fait : le store Drizzle qui implémente `CalibrationStore` revient au fil agent, propriétaire du schéma de l'enregistrement. Le job de purge à 90 jours viendra plus tard.
Décisions : `UPDATE` reste accordé au rôle applicatif pour la purge, le trigger refusant tout le reste ; `verdict` en jsonb à côté de `verdict_kind` en colonne.
Découvertes : le playground n'a pas de créatrice aujourd'hui ; le store devra en recevoir une (la seule existante, ou un choix dans l'écran).
Candidats à suppression : le JSONL `NIRVANA_TRAINING_DIR`, une fois le store branché et les notes existantes importées.
Vérifié : pnpm check ✓, intégration db ✓ (31).
