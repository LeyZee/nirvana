# 2026-10-19 · Dashboard : clé manquante et jobs bloqués (recette R-G6)

Fait :
- `DashboardSchema.voice.keyMissing` : vrai quand ni le modèle de la voix ni son repli n'ont de clé (Services ou environnement) ; `ok` reste faux. L'écran peut dire « Clé manquante » au lieu d'une panne.
- `DashboardSchema.jobs.dead` : les jobs que le worker a abandonnés (essais épuisés), ceux de la créatrice et ceux d'aucune créatrice ; `null` si le compte n'a pas pu être lu. Lu avec le rôle admin dans `graphile_worker._private_jobs` (la vue publique n'a pas le payload), `countDeadJobs` dans `readiness.ts`.
- Supervision reçoit `voiceHealth()` (au lieu de `isVoiceOk()`) et `deadJobs(creatorId)` de la racine de composition.
- Tests : intégration dashboard (sans clé : `keyMissing` vrai ; trois jobs morts dont un d'une autre créatrice : deux comptés), unitaires du contrat et de supervision, fixtures web.

Pas fait : l'affichage ambre (fil Dashboard) ; `voice.reachable` et `sessionCostEur` du Playground (PR à part, module playground).

Décisions : `keyMissing` plutôt qu'une liste générique de prérequis : une notion précise que l'écran affiche telle quelle ; ffmpeg aura sa propre forme quand l'agent l'exposera.

Relectures : agent (supervision), Dashboard (fixtures web).

Découvertes : des bases `test_*` restent dans le Postgres local après des exécutions interrompues (sans effet sur les tests).

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, intégration `apps/api` (109 tests).
