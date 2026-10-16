# Fiches de tâches

Une fiche = une session Opus 5.5 = une branche `task/<id>-<slug>` = une PR. Une session ne touche pas à ce qui n'est pas dans sa fiche ; si elle découvre un besoin, elle crée une nouvelle fiche `proposed` et le note dans le LOG.

## Format

```
# <ID> <Titre>
Statut : todo | in_progress | blocked | done
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

- `todo` : prête à être prise.
- `in_progress` : une session y travaille (une seule à la fois ; le nom de la branche est dans la fiche).
- `blocked` : attend Charles ou une autre fiche ; la raison est dans la fiche.
- `done` : PR fusionnée, critères vérifiés, LOG mis à jour.

## Index

| ID | Titre | Phase | Statut | Dépend de |
|---|---|---|---|---|
| P0-01 | Outillage du monorepo | 0 | todo | — |
| P0-02 | Contrats partagés : identifiants, argent, événements, jobs | 0 | todo | P0-01 |
| P0-03 | Base de données : schéma noyau, migrations, RLS, `withTenant` | 0 | todo | P0-02 |
| P0-04 | Serveur Fastify et worker Graphile, composition root, santé | 0 | todo | P0-03 |
| P0-05 | Module `conversations` : ingestion, journal, projections | 0 | todo | P0-04 |
| P0-06 | Module `connectors` : port, `FakeConnector`, test de contrat, poller | 0 | todo | P0-05 |
| P0-07 | CI, hooks, sécurité de base, bout en bout phase 0 | 0 | todo | P0-06 |
| P1-01 | Extension : enregistreur d'API | 1 | todo | P0-01 |
| P1-02 | Analyse de l'API Reveal et FakeReveal | 1 | blocked (accès Reveal) | P1-01 |
| P1-03 | Décision B/C et spécification du connecteur Reveal | 1 | todo | P1-02 |
| H-01 | Première session d'hygiène | 0 | todo | P0-07 |
| D-01 | Design system « Liquid Glass » | 4 | in_progress | P0-01 |
