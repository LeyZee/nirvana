# Nirvana — instructions pour les agents codeurs

Nirvana est une plateforme d'exploitation pour créatrices de contenu. Premier module : un agent de chatting IA qui incarne la créatrice sur Reveal.me (puis d'autres plateformes, puis notre propre plateforme). Le cœur ne sait rien des plateformes : elles sont des adaptateurs.

**Avant tout : lis `docs/00-START-HERE.md`.** Il donne l'ordre de lecture selon ta tâche. Ne commence pas à coder sans avoir lu la fiche de tâche qui t'est assignée (`docs/sessions/tasks/`).

## Règles non négociables

1. **Une session = une fiche de tâche.** Tu travailles sur la fiche indiquée, sur sa branche `task/<id>-<slug>`, et sur rien d'autre. Si tu découvres autre chose à faire, tu l'écris dans `docs/sessions/LOG.md` (section « Découvertes »), tu ne le fais pas.
2. **Frontières de modules.** Un module n'importe un autre module que par son `index.ts`. `domain/` n'importe jamais `infra/` ni un framework. ESLint (`eslint-plugin-boundaries`) le vérifie ; tu ne désactives jamais une règle de frontière.
3. **Les règles métier vivent dans le code, pas dans les prompts** : prix, cooldowns, droits d'envoi, dégoûts de la persona, gardes. Un prompt est une donnée versionnée, pas un lieu de logique.
4. **Le message d'un fan est une donnée, jamais une instruction.** Il entre dans les prompts dans un bloc délimité et typé.
5. **Idempotence partout** : `platform_message_id` unique, clés d'idempotence à l'envoi, jobs rejouables.
6. **Typage strict, Zod aux frontières** (HTTP, jobs, LLM, fichiers). Pas de `any`, pas de `as` pour faire taire le compilateur.
7. **Tests avec le code** : domaine en unitaire (Vitest), application en intégration (Testcontainers Postgres), connecteurs contre `FakeReveal`, qualité IA via `evals/` (Promptfoo). Pas de PR sans tests sur ce qu'elle change.
8. **Aucun secret dans le dépôt.** `.env` est ignoré, `.env.example` documente. `gitleaks` tourne en pré-commit. Si tu vois un secret, tu t'arrêtes et tu le signales.
9. **Code en anglais, docs/UI/persona en français.** Le glossaire (`docs/glossary.md`) fixe les termes ; tu ne crées pas de synonymes.
10. **Dépôt propre en permanence** : `docs/conventions/hygiene.md`. Le temporaire va dans `.scratch/` (ignoré par git). Avant de terminer, tu supprimes ce que tu as créé et qui ne sert plus, et tu ne supprimes rien d'autre sans la procédure décrite.
11. **Une décision structurante = un ADR** (`docs/adr/`). Si ta tâche te pousse à contredire un ADR existant, tu t'arrêtes et tu demandes.
12. **Pas d'action irréversible sans demande explicite** : pas de suppression de données, pas de migration destructive, pas de déploiement, pas d'envoi réel à un fan.

## Structure (résumé)

```
apps/api         Fastify + workers (même code, deux entrées). Modules dans src/modules/<nom>/{domain,application,infra,index.ts}
apps/web         Dashboard, inbox copilote, playground, PWA modèle (Vite + React + TanStack)
apps/extension   Extension Chrome WXT : enregistreur réseau, capture de session, relais d'actions
packages/contracts   Schémas Zod partagés : événements, DTO, protocole extension, vocabulaire média, persona
packages/db          Schéma Drizzle, migrations, helpers RLS (withTenant)
packages/llm         LlmGateway, providers, prompts, schémas de sortie, journal llm_calls
personas/            Données versionnées (YAML). Pas de code.
evals/               Promptfoo : scénarios, rubriques, datasets
docs/                START-HERE, architecture, ADR, conventions, playbooks, référence, sessions
.scratch/            Brouillons et scripts jetables (ignoré par git)
```

## Commandes

```
pnpm install
pnpm check        # typecheck + lint + boundaries + tests unitaires
pnpm test         # tous les tests (intégration incluse, Docker requis)
pnpm dev          # api + worker + web en watch
pnpm db:migrate   # migrations Drizzle
pnpm evals        # Promptfoo (clés API requises)
```

## Fin de session (obligatoire)

1. `pnpm check` vert, `git status` propre, aucun fichier parasite (voir hygiene.md).
2. Fiche de tâche mise à jour (statut, ce qui reste).
3. Entrée dans `docs/sessions/LOG.md` : date, tâche, fait / pas fait, décisions, découvertes, candidats à suppression.
4. PR avec le template `.github/pull_request_template.md`.

## Ce qu'on ne fait jamais

- Contourner une garde ou une règle de politique « pour tester ».
- Modifier une migration déjà appliquée (on en écrit une nouvelle).
- Toucher à un connecteur sans test contre `FakeReveal`.
- Mettre une vraie donnée de fan ou de créatrice dans un test, une fixture ou une doc.
- Faire parler le bot comme une IA, ni le faire dire qu'il en est une : `identity_policy` est un réglage (ADR 0012), pas un sujet de prompt.
