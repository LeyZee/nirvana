# 2026-10-19 · Commandes mortes vérifiées par check-repo (G14)

Fait :
- `pnpm persona:load` et `persona:validate` existent depuis #63 : rien à réparer côté scripts.
- `scripts/check-repo.mjs` (point 8) vérifie maintenant ce que la revue reprochait : un script racine `pnpm --filter <paquet> [run] <script>` doit viser un paquet du workspace qui a ce script, et un `tsx <fichier>` d'un script de paquet doit nommer un fichier qui existe.
- `hygiene.md` le mentionne.

Pas fait : rien.

Décisions : la liste des paquets se lit sur `apps/*`, `packages/*` et `evals`, comme `pnpm-workspace.yaml` ; check-repo reste sans dépendance.

Relectures : aucune (outil de dépôt, zone Bilan).

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check` vert ; un script renommé et un fichier `tsx` absent, posés à la main dans `apps/api/package.json`, donnent bien deux erreurs, retirées ensuite.
