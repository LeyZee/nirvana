# Stratégie de tests

Cinq couches, chacune avec un outil et un but. Une PR touche la couche qui correspond à ce qu'elle change ; on ne « compense » pas un test manquant par un autre.

| Couche | Outil | Quoi | Vitesse | Quand |
|---|---|---|---|---|
| Unitaire domaine | Vitest | Règles pures, machines d'état, politiques, gardes, schémas Zod | ms | `pnpm check`, à chaque commit |
| Intégration | Vitest + Testcontainers (Postgres) | Repositories, RLS, jobs Graphile, cas d'usage de bout en bout sur une base réelle | s | `pnpm test`, CI |
| Contrat connecteur | Vitest | La **même suite** tourne contre `FakeConnector`, `FakeReveal` (serveur mock) et, à la main, contre Reveal réel en lecture | s | CI (Fake) ; manuel (réel) |
| E2E | Playwright | Dashboard (inbox copilote), extension contre `FakeReveal` | min | CI nightly + avant release |
| Qualité IA | Promptfoo | Scénarios, rubriques, adversarial, régression de prompts et de modèles | min, coûte des tokens | Sous-ensemble en CI ; complet avant changement de persona/modèle |

## Règles

- Les tests du domaine ne touchent ni base, ni réseau, ni horloge réelle (horloge injectée : `clock.now()`).
- Les tests d'intégration créent leur schéma via les migrations réelles (pas de `sync`), dans une base jetable par fichier de test.
- Chaque bug corrigé commence par un test qui le reproduit.
- Les fixtures sont inventées, courtes, nommées (`fixtures/fans.ts: theQuietFan`). Jamais de donnée réelle.
- Les tests de politique et de gardes couvrent systématiquement : le cas nominal, le cas limite, le cas adversarial.
- Un test flaky est corrigé ou supprimé dans la journée, jamais mis en `retry`.

## FakeReveal

Un serveur HTTP (Fastify, dans `apps/api/test/fake-reveal/`) qui imite l'API de Reveal telle qu'observée (phase 1), piloté par des scénarios (`scenarios/*.json` : messages qui arrivent à t+X, session qui expire, erreur 500, rate limit). C'est contre lui que tourne le connecteur en CI et en dev. Il est mis à jour à chaque changement observé de Reveal (voir `docs/reference/reveal-api-observed.md`), et ses enregistrements anonymisés sont protégés (hygiene.md).

## Évals (résumé, détail dans `docs/playbooks/write-an-eval.md`)

- `evals/scenarios/` : conversations simulées (fan joué par un script ou un modèle), un fichier par scénario, avec le résultat attendu du **cerveau** (décision, faits, risques) et la rubrique de la **voix**.
- `evals/adversarial/` : injections et pièges.
- `evals/regression/` : cas réels anonymisés et validés par Messa (plus tard), figés.
- Seuils dans `evals/thresholds.json` ; la CI échoue si le sous-ensemble `smoke` passe sous le seuil.
