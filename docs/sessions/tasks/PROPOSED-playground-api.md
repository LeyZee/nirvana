# API du playground pour l'écran Entraîner (ID proposé : P3-06)
Statut : proposed (accord du coordinateur le 17/10 à 20h05 ; ID à valider par Charles)
Phase : 3
Dépend de : P3-05, P0-04, P0-07a, P3-03 (clés du CRM)
Branche : claude/project-thread-e0j3ow

## Objectif
L'écran Entraîner > Playground du CRM (fil Extension) pilote le moteur de calibrage de P3-05 par HTTP, sous `/v1/playground`. Les DTO sont dans `packages/contracts/src/playground.ts`.

## Contexte à lire
`CLAUDE.md`, `docs/architecture/ai-engine.md` (Calibrage), `docs/conventions/api.md`, `apps/api/src/scripts/playground-session.ts`, `apps/api/src/composition-root.ts`.

## À faire
- [x] DTO partagés : état, réponse, comparaison, note, corps de chaque requête, codes d'erreur. Les raisons de rejet et les destinations passent de `agent/domain` à `contracts`.
- [ ] Module `playground` (domain, application, infra, index), dépendant d'`agent` seulement. Il comprend :
  - une session par utilisateur en mémoire ;
  - les médias saisis complétés en description ;
  - les libellés français des gardes et des pièges, écrits côté serveur.
- [ ] Routes sous `/v1/playground` :
  - lecture : `GET /` ;
  - session : `POST /preset`, `/reset`, `/messages`, `/rating`, `/branch`, `/compare` ;
  - situation : `PATCH /situation`, `POST /advance` ;
  - contenu : `PUT /notes`, `POST /creator-media`.

  Garde `requireRole('owner')`. Réponse 503 `llm_unavailable` sans clé, 409 sur une note impossible.
- [ ] Composition root : une ligne de démarrage du module et ses routes dans le tableau. Clés par `modules.providers.apiKeySource`, refus par `onKeyRefused`, plafond par `onBudget`.

## Critères d'acceptation
- `pnpm check` et `pnpm test` verts. Tests du module : service contre un faux moteur, routes avec `fastify.inject` et une fausse passerelle.
- Rien n'est envoyé à un fan. Les notes restent hors dépôt (JSONL dans `NIRVANA_TRAINING_DIR`) tant qu'il n'y a pas de table.

## Hors périmètre
L'écran (fil Extension), une table pour les notes (à demander au fil plomberie avant la prod), l'accès de Messa (rôle `creator`, plus tard), l'envoi d'un vrai média à Vision.
