# 0001. TypeScript, monorepo pnpm + Turborepo

Statut : accepted
Date : 2026-10-16

## Contexte

Le projet comprend une API, un worker, un dashboard web, une extension Chrome, des contrats partagés et des packages (db, llm). Charles est formé au développement web ; les sessions de code sont des agents Opus 5.5. Les prédécesseurs (Imperium en JS, OnlyScript en Python) ont montré le coût d'un typage faible et de contrats dupliqués entre front et back.

## Décision

- **TypeScript strict partout** (API, worker, web, extension, scripts). Node 22 LTS.
- **Un seul dépôt** (monorepo) géré par **pnpm workspaces** et **Turborepo** pour le cache et l'ordonnancement des tâches (`check`, `test`, `build`).
- Les types partagés vivent dans `packages/contracts` (Zod), importés par tous.
- Pas de Python dans le runtime. Si un outil Python s'impose (analyse ponctuelle), il vit dans `.scratch/` ou dans un dépôt séparé.

## Conséquences

- Un seul langage, un seul outillage, des types de bout en bout : les contrats cassés sont détectés à la compilation.
- Les sessions Opus n'ont qu'un ensemble de conventions à apprendre.
- Coût : configuration initiale (tsconfig, eslint, turbo) à soigner en P0-01 ; builds plus lents qu'un projet monolangage sans types, compensés par le cache Turbo.
- À surveiller : ne pas laisser proliférer les packages. Un package n'existe que s'il est consommé par au moins deux apps.

## Alternatives rejetées

- **Python (FastAPI) pour l'API** comme OnlyScript : excellent pour l'IA, mais deux langages, deux systèmes de types, contrats dupliqués avec le front et l'extension.
- **Polyrepo** : synchronisation des contrats manuelle, exactement le problème à éviter.
- **Nx** : plus puissant, plus lourd ; Turborepo suffit à cette taille.
