# Journal des sessions

Index des sessions. Depuis le 16/10/2026 (soir), chaque session écrit son entrée dans son propre fichier `docs/sessions/log/<date>-<id>.md` (format dans `docs/sessions/README.md`) et ajoute une ligne au tableau ci-dessous ; les entrées plus anciennes restent en bas de ce fichier, figées.

## Index

| Date | Fiche | Statut | Entrée |
|---|---|---|---|
| 2026-10-16 | Revue des fondations (Fable) | done | `log/2026-10-16-fondations-revue.md` |
| 2026-10-16 | Logo et marque (Fable) | done | `log/2026-10-16-logo.md` |
| 2026-10-16 | Revue indépendante (Opus) | done | `log/2026-10-16-revue-independante.md` |
| 2026-10-17 | Brainstorm interface, extension, playground (Opus) | done | `log/2026-10-17-interface-brainstorm.md` |
| 2026-10-17 | P0-01 Outillage du monorepo (Opus) | done (PR #14) | `log/2026-10-17-p0-01.md` |
| 2026-10-17 | P3-01 Passerelle LLM, Grok 4.7 et playground (Opus) | in_progress | `log/2026-10-17-p3-01.md` |
| 2026-10-17 | P0-08 Schéma de persona calqué sur OnlyChat | done (PR #17) | `log/2026-10-17-p0-08.md` |
| 2026-10-17 | Vocaux générés, conception (Opus) | proposed | `log/2026-10-17-vocaux.md` |
| 2026-10-17 | Connexion Reveal : inventaire, capture, FakeReveal (Opus) | done | `log/2026-10-17-reveal-connexion.md` |
| 2026-10-17 | ADR 0018 port connecteur étendu (Opus) | done | `log/2026-10-17-adr-0018.md` |
| 2026-10-17 | P3-03 Connexion des services IA, conception (Opus) | done | `log/2026-10-17-p3-03-conception.md` |
| 2026-10-17 | P3-03 Connexion des services IA, module `providers` (Opus) | in_progress | `log/2026-10-17-p3-03.md` |
| 2026-10-17 | README à jour et design system en images | done | `log/2026-10-17-readme-design.md` |
| 2026-10-17 | P3-04 Vision des médias et pièges (Opus) | in_progress | `log/2026-10-17-p3-04.md` |
| 2026-10-17 | Coquille du dashboard et écran Playground (Opus) | in_progress | `log/2026-10-17-web-coquille-playground.md` |
| 2026-10-17 | P0-02 Contrats partagés | done | `log/2026-10-17-p0-02.md` |
| 2026-10-17 | P0-03 Base de données | done | `log/2026-10-17-p0-03.md` |
| 2026-10-17 | P0-04 Serveur et worker | done | `log/2026-10-17-p0-04.md` |
| 2026-10-17 | P3-05 Boucle de calibrage dans le playground (Opus) | in_progress | `log/2026-10-17-p3-05.md` |
| 2026-10-17 | P3-06 API du playground (Opus) | in_progress | `log/2026-10-17-p3-06.md` |
| 2026-10-17 | Politique de vente du corpus, ID proposé (Opus) | in_progress | `log/2026-10-17-sales-policy.md` |
| 2026-10-17 | P0-07a Login du dashboard | done | `log/2026-10-17-p0-07a.md` |
| 2026-10-17 | P0-05 Module conversations | done | `log/2026-10-17-p0-05.md` |
| 2026-10-17 | P0-06 Module connectors | done | `log/2026-10-17-p0-06.md` |
| 2026-10-17 | P0-05 suite : port du moteur et journal `llm_calls` | done | `log/2026-10-17-p0-05-composer.md` |
| 2026-10-17 | P0-07b CI, scripts ops, bout en bout : phase 0 acceptée | done | `log/2026-10-17-p0-07b.md` |
| 2026-10-17 | Redemande du mot de passe avant une clé IA (ADR 0016) | done | `log/2026-10-17-reauth.md` |
| 2026-10-17 | Créatrices : liste et création | done | `log/2026-10-17-creators.md` |
| 2026-10-17 | Garde-fou local contre les push sur `main` | done | `log/2026-10-17-protect-main.md` |
| 2026-10-17 | Table des notes d'entraînement (`calibration_ratings`) | done | `log/2026-10-17-calibration-table.md` |
| 2026-10-17 | Fiches proposées : alertes de nuit, copilote côté API | done | `log/2026-10-17-fiches-alertes-copilote.md` |
| 2026-10-17 | Démarrage sous Windows : fins de ligne et clés vides | done | `log/2026-10-17-windows.md` |
| 2026-10-17 | Contrats pour les alertes (cause de passage à un humain, budget, reprise) | done | `log/2026-10-17-alert-contracts.md` |
| 2026-10-17 | Persona : genre déprécié | done | `log/2026-10-17-persona-gender.md` |
| 2026-10-17 | `owner:create` ne montre plus le mot de passe | done | `log/2026-10-17-owner-password.md` |
| 2026-10-17 | Dashboard, PR 1 : pièces du design system | done | `log/2026-10-17-dashboard-ds.md` |
| 2026-10-17 | Alertes Telegram : ADR 0020, fiche P3-07, maquette | done | `log/2026-10-17-alertes-telegram.md` |

## Incidents (liste vivante)

_Aucun pour l'instant._

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
- README réécrit (bannière, badges, diagrammes Mermaid, structure, méthode, pile, sécurité, roadmap, qui).
- Brief design `docs/design/brief.md` (Liquid Glass iOS 26/27) et fiche `D-01`.
- Dépôt GitHub `LeyZee/nirvana` créé (privé, branche `main`) depuis le PC de Charles avec son compte, et rattaché au projet. GitHub est désormais la source de vérité ; le dossier du projet et le dossier local de Charles en sont deux clones.

## 2026-10-16 (nuit) — D-01 Design system « Liquid Glass » — in_progress (Opus 5.5)

Fait : `packages/design-system` (tokens Nuit/Jour, pont Tailwind v4, classes `nv-*`, aides d'animation, test de contraste AA), guide `docs/design/README.md`, renvois mis à jour (README, CLAUDE.md, START-HERE, apps/web, apps/extension, brief).
Pas fait : composants shadcn/ui restylés, `_playground.tsx`, test axe-core : bloqués par P0-01 (apps non initialisées).
Décisions : réponses de Charles au brief (identité propre, néon rouge sur nuit, en code) ; ADR 0015 proposée (package partagé web + extension) ; règle de frontière `app → package design-system` ajoutée dans `eslint.config.js`.
Découvertes : la palette de l'ancienne bannière (violet, cyan) ne correspond plus à la direction choisie ; la bannière est à refaire quand un logo existera.
Candidats à suppression : aucun.
Vérifié : typecheck strict ✓ et tests Vitest ✓ (27) via un outillage jetable dans `.scratch/` ; rendu des deux thèmes vérifié dans le navigateur. `pnpm check` non exécutable avant P0-01 (pas de `pnpm install`).
Suite : l'artifact de référence (lien dans `docs/design/README.md`) est aligné sur le dépôt (tokens, vocabulaire du glossaire, DraftPanel et ExtensionPopup à la place du panneau d'extension) ; `.nv-aura` reçoit `contain: paint` pour que ses halos ne débordent pas du `body`.
Découvertes (CI, PR #1) : la CI est rouge sur `main` comme sur la PR, pour deux causes antérieures à D-01. (1) `check`, `test` et `audit` s'arrêtent à `actions/setup-node` (`cache: pnpm`) faute de `pnpm-lock.yaml` : relève de P0-01. (2) `gitleaks/gitleaks-action@v2` reçoit un 403 en listant les commits de la PR, car le workflow n'accorde que `contents: read` ; il lui faut aussi `pull-requests: read`. Relève de P0-07, non corrigé ici.
