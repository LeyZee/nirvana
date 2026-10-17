# Fiches de tâches

Une fiche = une session Opus 5.5 = une branche `task/<id>-<slug>` = une PR. Une session ne touche pas à ce qui n'est pas dans sa fiche ; si elle découvre un besoin, elle crée une nouvelle fiche `proposed` (`PROPOSED-<slug>.md`) et le note dans son entrée de journal.

## Format

```
# <ID> <Titre>
Statut : proposed | todo | in_progress | blocked | done
Phase : n
Dépend de : <IDs>
Branche : task/<id>-<slug>

## Objectif (1 phrase)
## Contexte à lire (fichiers précis)
## À faire (liste vérifiable)
## Critères d'acceptation (tests, commandes, comportements observables)
## Hors périmètre
## Notes de session (rempli par la session : décisions, surprises, fiches créées)
```

## Statuts

- `proposed` : écrite par une session, pas encore acceptée par Charles ; pas d'ID, pas dans l'index.
- `todo` : prête à être prise.
- `in_progress` : une session y travaille (une seule à la fois ; le nom de la branche est dans la fiche).
- `blocked` : attend Charles ou une autre fiche ; la raison est dans la fiche.
- `done` : PR fusionnée, critères vérifiés, LOG mis à jour.

## Index

| ID | Titre | Phase | Statut | Dépend de |
|---|---|---|---|---|
| P0-01 | Outillage du monorepo | 0 | done | — |
| P0-02 | Contrats partagés : identifiants, argent, événements, jobs | 0 | done | P0-01 |
| P0-03 | Base de données : schéma noyau, migrations, RLS, `withTenant` | 0 | done | P0-02 |
| P0-04 | Serveur Fastify et worker Graphile, composition root, santé | 0 | done | P0-03 |
| P0-05 | Module `conversations` : ingestion, journal, projections | 0 | todo | P0-04 |
| P0-06 | Module `connectors` : port, `FakeConnector`, test de contrat, poller | 0 | todo | P0-05 |
| P0-07a | Authentification du dashboard, rôles, CSRF, page de connexion | 0 | done | P0-04 |
| P0-07b | CI, scripts ops, bout en bout phase 0 | 0 | todo | P0-06, P0-07a |
| P0-08 | Schéma de persona calqué sur OnlyChat | 0 | done | P0-01 |
| P1-01 | Extension : enregistreur d'API | 1 | todo | P0-01 |
| P1-02 | Analyse de l'API Reveal et FakeReveal | 1 | blocked (capture de Charles) | P1-01 ou capture HAR |
| P1-03 | Décision B/C et spécification du connecteur Reveal | 1 | todo | P1-02 |
| P3-01 | Passerelle LLM multi-fournisseurs, Grok 4.7 et playground en terminal | 3 | in_progress | P0-01 |
| P3-02 | Mémoire par fan : coder le module `fans` | 3 | todo | P0-03, P0-05, P0-08, P1-02 |
| P3-03 | Connecter Grok, Gemini et ElevenLabs depuis le dashboard | 3 | todo | P0-03, P0-04, P0-07a, P3-01, D-01 |
| P6-01 | Catalogue tarifé : index des scripts Reveal, de leurs étapes et de leurs bundles | 6 | todo | P3-02, P1-02, P1-03 |
| P3-04 | Vision des médias et protection contre les pièges | 3 | in_progress | P3-01 |
| P3-05 | Boucle de calibrage dans le playground | 3 | in_progress | P3-04 |
| H-01 | Première session d'hygiène | 0 | todo | P0-07b |
| D-01 | Design system « Liquid Glass » | 4 | in_progress | P0-01 |
