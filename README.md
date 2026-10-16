# Nirvana

Agent de chatting pour créatrice de contenu : il lit les conversations d'une plateforme (Reveal d'abord), comprend le fan, se souvient de lui, répond en incarnant la créatrice selon une persona versionnée, propose des réponses à approuver (puis les envoie seul par catégories), vend des médias au bon moment. Un dashboard supervise tout ; une extension Chrome capture la session ; le cœur ne dépend d'aucune plateforme et accueillera notre propre plateforme.

**Si tu es une session de code : commence par [`CLAUDE.md`](CLAUDE.md) puis [`docs/00-START-HERE.md`](docs/00-START-HERE.md).**

## Structure

```
apps/api         Fastify + Graphile Worker, modules métier (src/modules/*)
apps/web         Dashboard (Vite, React 19, Tailwind v4, shadcn/ui), PWA
apps/extension   Extension Chrome (WXT) : enregistreur, capture de session
packages/contracts   Types et schémas Zod partagés
packages/db          Drizzle, migrations, RLS, chiffrement
packages/llm         Passerelle LLM (sens, cerveau, voix, juge), prompts
personas/        Schéma et placeholder de persona (la vraie est hors dépôt)
evals/           Scénarios Promptfoo (comportement, adversarial, régression)
docs/            Architecture, ADR, conventions, playbooks, runbooks, sessions
```

## Commandes

```
pnpm install            # installe et pose les hooks git
pnpm dev                # api + worker + web
pnpm check              # typecheck, lint (frontières), format, knip
pnpm test               # unitaires ; test:integration (Testcontainers) ; test:e2e
pnpm db:migrate         # migrations
pnpm evals              # évals Promptfoo (coûte des appels LLM)
```

## État

Phase 0 (fondations) : squelette et documentation en place, code à écrire fiche par fiche (`docs/sessions/tasks/`). Roadmap : `docs/roadmap.md`.

## Licence

Privé. Tous droits réservés.
