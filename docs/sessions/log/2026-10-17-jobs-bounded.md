# 2026-10-17 — Jobs bornés, échec définitif visible — done
Fait : un `send_failed` porte `isFinal` ; un refus définitif dès le premier essai (garde d'écriture fermée) fait passer la conversation en `error` au lieu de la laisser en `sending` (G3 de la revue à froid). Chaque job a un nombre d'essais borné (`JOB_MAX_ATTEMPTS` dans contracts/jobs.ts, appliqué par les trois façons de mettre en file et par la crontab) au lieu des 25 de Graphile ; `/ready` compte les jobs abandonnés (`deadJobs`) sans passer « non prêt » (G11).
Pas fait : rien.
Décisions : un événement `send_failed` écrit avant `isFinal` garde l'ancienne règle (le nombre d'essais). Un contenu de job invalide reste un échec gardé par Graphile pour lecture, désormais trois essais au plus.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, tests unitaires et d'intégration api ✓.
