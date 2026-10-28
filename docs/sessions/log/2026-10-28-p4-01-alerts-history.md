# 2026-10-28 — P4-01 : historique des alertes et « vu » (PR A2) — done
Fait : contrat `alert-history.ts` (`AlertTriggerItem`, filtres, « vu », `SYSTEM_ALERT_LABELS`, `alertTriggerReason`), routes `/v1/alerts/triggers` dans `conversations` (liste par créatrice, curseur, filtres `seen` et `alert`, « vu » un par un et jusqu'à une date), port `AlertNames` branché sur `alerts.store.names` par le composition root, `alert_seen` passe à `conversations` (docs), test d'intégration et test de contrat.
Pas fait : l'écran (Extension), l'écriture des déclenchements par l'agent (PR B), le classement de `alert_triggered` par Telegram.
Découvertes : `creatorId` est exigé, comme pour toutes les routes du Suivi ; une liste toutes créatrices confondues demanderait de fusionner les pages de chaque créatrice sous sa RLS, à faire si l'écran le demande.
Candidats à suppression : aucun.
