# 2026-10-17 — Garde-fou local contre les push directs sur main (choix de Charles : « hook ») — done
Fait : `scripts/protect-main.mjs` (hook pre-push lefthook, avant `check` et `test`) refuse tout push vers `main` et sa suppression ; contournement d'urgence `NIRVANA_ALLOW_MAIN_PUSH=1`. Règle écrite dans `git-and-pr.md` et `CLAUDE.md`, vérification dans `local-dev.md`.
Pas fait : protection côté serveur (plan GitHub Pro, refusé par Charles pour l'instant).
Décisions : les force push restent permis hors `main`, parce qu'une branche de fil est réinitialisée après chaque fusion squash.
Découvertes : les fusions faites par l'API GitHub ne passent pas par ce hook ; seule la règle « PR verte » les encadre.
Candidats à suppression : aucun.
Vérifié : tests du script ✓ (3), `git push --dry-run origin HEAD:main` refusé avant `pnpm check` ✓.
