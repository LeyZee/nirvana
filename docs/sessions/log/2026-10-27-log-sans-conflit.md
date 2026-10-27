# 2026-10-27 — Journal des sessions sans conflit — done
Fait : le dossier `docs/sessions/log/` devient l’index du journal. Le tableau de `docs/sessions/LOG.md` est figé au 27/10 ; `pnpm sessions:log [n | --all]` (`scripts/session-log.mjs`) affiche les entrées, les plus récentes d’abord. `scripts/check-repo.mjs` (contrôle 9) vérifie le nom `<date>-<slug>.md` et la première ligne `# <date>` de chaque entrée, et refuse toute ligne du tableau datée après le 27/10. CLAUDE.md, `docs/sessions/README.md` et le modèle de PR disent la nouvelle règle.
Pas fait : rien.
Décisions : un fichier par session plutôt qu’un pilote de fusion `union` dans `.gitattributes` : `union` dépend du moteur de fusion de GitHub (non vérifié qu’il l’applique quand il juge une PR fusionnable) et laisse les lignes dans un ordre arbitraire, alors que sans fichier partagé il n’y a plus rien à fusionner. Les listes vivantes de LOG.md (Incidents, Candidats à suppression) restent, elles changent rarement.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓ ; contrôle 9 essayé à la main (un nom en majuscules et une ligne datée du 28/10 sont refusés) ; les 151 entrées existantes passent.
