# 2026-10-19 — `globalStop` dans `GET /v1/dashboard` (supervision) — done

Fait : le contrat `DashboardSchema` porte `globalStop`, même nom et même sens que la réponse de `PUT /v1/agent/mode` (#83). Le lecteur `supervision` distingue l'interrupteur global de celui de la créatrice (`switches: { global, creator }` au lieu de `isStopped`) ; le mode reste Arrêt si l'un des deux est posé.

Pas fait : l'affichage de la raison à l'écran (fil Extension, `apps/web`).

Décisions : aucune nouvelle ; suite de la relecture de #83 (remarque 2).

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test` ; tests d'intégration `dashboard` et `agent-mode` complétés (le Dashboard rechargé dit Arrêt et `globalStop: true` sous l'interrupteur global), exécutés en CI (pas de Docker ici).
