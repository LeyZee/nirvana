# Journal des sessions

Append-only. Une entrée par session, en bas. Format dans `docs/sessions/README.md`.

## Candidats à suppression (liste vivante)

_Aucun pour l'instant._

---

## 2026-10-16 — Phase 0 : fondations documentaires — done (Fable 5.1, architecte)

Fait : structure du dépôt, `CLAUDE.md`, docs d'architecture, ADR 0001 à 0014, conventions (code, tests, git, sécurité, hygiène), glossaire, playbooks, références (OnlyChat, projets hérités, vocabulaire média, schéma persona, gabarit API Reveal), roadmap, fiches P0-01 à P0-07 et P1-01 à P1-03, configs racine (pnpm, turbo, tsconfig, eslint boundaries, prettier, lefthook, CI, PR template).
Pas fait : aucun code applicatif (volontaire : P0-01 à P0-07). `pnpm install` non exécuté ici.
Décisions : voir `docs/adr/`.
Découvertes : le dépôt Imperium contient des secrets committés (signalé à Charles le 16/10).
Candidats à suppression : aucun.
Vérifié : relecture des docs ✓. Pas de code à tester.

## 2026-10-16 (soir) — Dépôt à la racine du projet, README visuel, brief design — Fable (architecture)

- Le dépôt git est désormais la racine de `Projet Nirvana/` (demande de Charles) ; le sous-dossier `nirvana/` a été supprimé. `brainstorm/` et le cahier des charges sont suivis par git comme historique, protégés par `hygiene.md`.
- README réécrit (bannière `docs/assets/banner.svg`, badges, diagrammes Mermaid, structure, méthode, pile, sécurité, roadmap, qui).
- Brief design `docs/design/brief.md` (Liquid Glass iOS 26/27) et fiche `D-01`.
- Dépôt GitHub `LeyZee/nirvana` créé (privé, branche `main`) depuis le PC de Charles avec son compte, et rattaché au projet. GitHub est désormais la source de vérité ; le dossier du projet et le dossier local de Charles en sont deux clones.
