# 2026-10-16 — Revue indépendante du dossier (Opus 5.5) — done

Fait : revue complète à froid (note `brainstorm/05-revue-independante.md`) ; outillage installé dans un bac à sable pour vérifier les affirmations. `eslint.config.js` réparé (il ne se chargeait pas, puis ne détectait ni les imports interdits ni les cycles) et prouvé sur quatre violations volontaires ; `check-repo` contrôle enfin les fiches P0/P1 et les commandes des blocs de code ; routes alignées (tout sous `/v1` sauf `/health`, `/ready`) ; Langfuse auto-hébergé dans `.env.example` ; petites erreurs de fiches corrigées ; `prettier --write` sur les fichiers suivis.
Pas fait : les manques métier (parcours fan, types de vente, import de l'historique Reveal, reporting, place d'OnlyFans) sont proposés à Charles, pas tranchés.
Décisions : aucune ADR.
Découvertes : voir la note 05, §2 à §4 (dont `BYPASSRLS` de `nirvana_admin`, rôle de migration de Graphile Worker, distributeur de l'outbox sans fiche, `check-repo --strict` inutilisable tel quel).
Candidats à suppression : aucun.
Vérifié : `node scripts/check-repo.mjs` ✓ (0 erreur) ; ESLint sur fixtures jetables ✓ ; `prettier --check .` ✓. `pnpm check` complet impossible avant P0-01.
