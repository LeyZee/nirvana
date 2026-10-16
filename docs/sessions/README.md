# Sessions d'agents codeurs : le protocole

Le projet avance par sessions. Une session = un agent (Claude Opus 5.5 dans Claude Code, en général), une fiche de tâche, une branche, une PR. Charles lance les sessions ; Claude Fable 5.1 (architecte) écrit les fiches et revoit les ADR. Ce document est le contrat entre les trois.

## Le cycle d'une session

### 1. Démarrage (10 min)

- Lire `CLAUDE.md`, `docs/00-START-HERE.md`, ta fiche dans `docs/sessions/tasks/`, les docs qu'elle liste, et les 5 dernières entrées de `docs/sessions/LOG.md`.
- Vérifier l'état : `git status` propre sur `main` à jour, `pnpm install`, `pnpm check` vert. Si ce n'est pas vert avant de commencer, tu le notes dans le LOG et tu t'arrêtes : ce n'est pas à toi de réparer en passant, sauf si ta fiche le dit.
- Créer la branche : `task/<id>-<slug>` (ex. `task/P0-03-api-bootstrap`).
- Passer la fiche en `in_progress` (champ `status` en tête de fiche) et commiter ce seul changement.

### 2. Pendant

- **Périmètre** : la fiche, rien que la fiche. Ce qui dépasse va dans le LOG (« Découvertes ») ou dans une nouvelle fiche proposée (`docs/sessions/tasks/PROPOSED-<slug>.md`), jamais dans la PR.
- **Ordre** : contrats (Zod) → domaine (pur, testé) → application → infra → UI. On écrit le test du domaine avant ou avec le code.
- **Frontières** : `pnpm lint` à chaque étape ; une erreur de frontière se résout en déplaçant le code, pas en désactivant la règle.
- **Décision structurante** (nouvelle dépendance de poids, nouveau pattern, changement de contrat partagé, choix qui engage plusieurs modules) : tu écris un ADR en statut `proposed` et tu t'arrêtes là-dessus en le signalant dans la PR. Tu n'implémentes pas une décision non acceptée si elle contredit un ADR existant.
- **Commits** : petits, conventionnels (`feat(conversations): …`, `fix(connectors): …`, `chore(cleanup): …`, `docs: …`, `test: …`). Un commit compile et passe les tests.
- **Données** : jamais de vraie donnée de fan, de créatrice ou de session dans un test, une fixture, un log ou une doc. Les fixtures sont inventées et évidemment fausses.

### 3. Fin (15 min, obligatoire)

1. `pnpm check` vert, `pnpm test` vert (Docker lancé pour Testcontainers).
2. Nettoyage selon `docs/conventions/hygiene.md`.
3. Docs touchées par la tâche mises à jour (architecture, README de module, playbook).
4. Fiche mise à jour : `status: done` ou `blocked` avec ce qui manque, et la section « Résultat ».
5. Entrée dans `docs/sessions/LOG.md` (format ci-dessous).
6. PR ouverte avec le template, titre = id + titre de la fiche. La PR décrit « avant / après » en français simple.

## Format d'une entrée de LOG

```
## 2026-10-20 — P0-03 Bootstrap de l'API — done
Fait : app factory Fastify, config Zod, runner Graphile, module connectors avec FakeConnector, ingestion idempotente.
Pas fait : SSE (hors périmètre, voir P0-06).
Décisions : ADR 0015 proposé (choix de la lib de config).
Découvertes : le schéma `messages` manque un index sur (conversation_id, platform_created_at).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (41 tests), hygiène ✓.
```

Le LOG est append-only : on ajoute en bas, on ne réécrit pas les entrées précédentes.

## Rôles

- **Charles** : décide, lance les sessions, valide les PR et les ADR. Donne l'accès aux comptes (Reveal, fournisseurs LLM).
- **Fable 5.1 (architecte)** : écrit et met à jour les fiches, les ADR, l'architecture ; revoit les PR structurantes ; arbitre les candidats à suppression.
- **Opus 5.5 (sessions)** : exécute les fiches dans ce protocole.

## Quand s'arrêter et demander

- La fiche est ambiguë sur un point qui change le résultat visible.
- Une étape demanderait une action irréversible (suppression de données, migration destructive, envoi réel, dépense).
- Un ADR existant bloque la solution évidente.
- Un secret, une donnée réelle ou un comportement suspect apparaît.

Dans ces cas : on écrit la question dans la PR ou le LOG, on passe la fiche en `blocked`, et on s'arrête proprement (étape 3 complète quand même).
