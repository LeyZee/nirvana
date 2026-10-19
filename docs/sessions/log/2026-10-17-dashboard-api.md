# 2026-10-17 — API du Dashboard (GET /v1/dashboard) — in_progress
Fait :
- Contrat `packages/contracts/src/dashboard.ts` : créatrice, période, mode de l'agent, verrou Automatique (`automatic { open, missing }`), taux en réel, connexion Reveal, voix, délais de réponse, gardes du jour par cause, budget du jour, file « à traiter » avec une phrase par cause, meilleurs fans. Pas de bloc ventes avant la capture Reveal.
- Module `supervision` : assemblage pur (`domain/dashboard.ts`), lecture SQL en lecture seule dans `withTenant` (`infra/views/dashboard-reader.ts`, l'exception documentée de modules.md), route `GET /v1/dashboard` avec rôle et périmètre de la créatrice, 404 `creator_not_found`, journée comptée dans le fuseau de la créatrice.
- Forme du verrou alignée sur l'écran (#67) : chaque condition manquante porte sa valeur et sa cible (`live_rate`, `decided_drafts`, `blind_test`).
- Telegram (P3-07) : `guards.telegramAlertsTonight` (alertes urgentes et importantes de sa nuit, `nightCounts` du module) et `telegramCoverage { urgentReachable }` (la couverture de Réglages › Telegram) ; les deux valent null quand Telegram est éteint.
- Câblage dans composition-root : budget lu sur la passerelle IA, version de la voix (prompt et modèle).
Pas fait :
- Verrou Automatique : `domain/automatic.ts` est provisoire ; il sera remplacé par le verrou unique de Bilan (B3, taux en réel depuis `calibration_ratings`) dès qu'il est dans main.
- Test à l'aveugle : toujours « non fait » tant qu'il n'existe pas.
- Ventes (PR 4) : après la capture Reveal.
Décisions : aucune nouvelle ; ADR 0019 appliqué tel quel.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (api 258, contracts 48) ; test d'intégration Postgres en CI.
