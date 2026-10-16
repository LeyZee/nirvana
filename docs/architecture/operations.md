# Opérations : environnements, déploiement, données, observabilité, coûts

## Environnements

| Env | Où | Connecteur | LLM | Base |
|---|---|---|---|---|
| `dev` | laptop | `FakeConnector` / `FakeReveal` | clés de test, plafonds bas, ou mock | Postgres local (Docker) ou branche Neon |
| `staging` | VPS, Compose séparé | `FakeReveal` par défaut ; compte Reveal de test si disponible | clés de test | branche Neon `staging` |
| `prod` | VPS | `RevealApiConnector` | clés prod, plafonds | Neon `main` |

Règle : le code ne connaît l'environnement que par la config (`packages/config`, schéma Zod, chargée au démarrage, validée, immuable). Aucune condition `if (env === 'prod')` dans le domaine.

## Déploiement

- Coolify sur le VPS : une application par processus (`api`, `worker`, `web` statique, `langfuse`), déploiement sur push de `main` après CI verte, image Docker construite par Coolify, rollback = redéployer l'image précédente.
- **Migrations** : exécutées par un job dédié avant le démarrage de la nouvelle version, jamais au boot de l'API. Pattern expand/contract : on ajoute (colonne nullable, nouvelle table), on déploie le code qui écrit les deux, on migre les données, on retire l'ancien dans une version suivante. Jamais de `DROP`/`ALTER ... NOT NULL` dans la même version que le code qui en dépend.
- **Arrêt gracieux des workers** : `SIGTERM` → on finit le job en cours (borné à 60 s), on ne prend plus de job, on sort. Graphile Worker gère les jobs orphelins par verrou expirant.
- **Santé** : `/health` (vivant), `/ready` (base joignable, migrations à jour, worker vu récemment). Coolify redémarre sur échec.

## Données

- Sauvegardes : Neon PITR (7 j minimum) + export logique quotidien chiffré vers un bucket (Hetzner Object Storage / R2), rétention 30 j. Médias : bucket avec versioning.
- **Restauration testée** une fois par trimestre sur `staging` (fiche `H-xx`). Procédure dans `docs/runbooks/restore.md`.
- Rétention et purge : jobs quotidiens (faits expirés, médias fan expirés, traces Langfuse > 30 j, `llm_calls` > 90 j agrégés).
- Croissance : `conversation_events` et `messages` partitionnés par mois quand on dépasse ~10 M de lignes (pas avant). Index prévus dès le départ : `(conversation_id, created_at)`, `(platform_account_id, platform_message_id)` unique.

## Observabilité

Trois outils, pas plus :

1. **pino** → stdout → logs Coolify (rétention courte). Structuré, avec `creator_id`, `conversation_id`, `job_id`, `trace_id`. Jamais de contenu de message, jamais de session.
2. **Sentry** : erreurs et performance API/worker, avec release = SHA du commit.
3. **Langfuse** : chaque appel LLM (rôle, modèle, version du prompt, tokens, coût, latence, lien vers la conversation), datasets d'éval, scores.

Et un **tableau de bord opérationnel** dans `apps/web` alimenté par des vues SQL (pas un outil de plus), avec les métriques de la doc §8 :

| Métrique | Source | Cible v1 |
|---|---|---|
| Latence de détection (message plateforme → ingéré) | `messages.platform_created_at` vs `created_at` | p95 < 60 s |
| Latence de génération (job → draft) | `conversation_events` | p95 < 30 s |
| Latence totale (fan → envoi) | idem | médiane < 2 min en auto |
| Taux d'envoi vérifié | `message_sent` / `send_attempted` | > 99,5 % |
| Messages perdus (réconciliation) | job de réconciliation | 0 |
| Doublons | contrainte unique (compte) | 0 |
| Taux d'intervention humaine | drafts édités ou rejetés / total | < 30 % en phase 5 |
| Coût LLM par conversation et par jour | `llm_calls` | suivi, plafond |
| Qualité conversationnelle | scores Promptfoo + notes humaines | seuil fixé avec Messa |

## Coûts et coupe-circuits

- Budget LLM par créatrice et par jour (config), compteur dans `llm_calls` ; au-delà : le bot passe en copilote et alerte.
- Plafonds côté fournisseurs (hard limits mensuels).
- Alerte si dépense horaire > 2× la médiane des 7 derniers jours.
- Rapport hebdomadaire de coût dans le dashboard.

## Temps

- Tout en UTC en base (`timestamptz`). Affichage et règles métier (horaires de persona, cooldowns « ce soir ») en `Europe/Paris` via la config de la créatrice (`creators.timezone`). Bibliothèque : `@date-fns/tz` ou `Temporal` quand stable en Node 22 (polyfill acceptable).
- Les heures de « vie » de la persona sont une donnée de persona, avec jitter, jamais une constante.

## Fournisseurs externes : règles de bonne conduite

- Vers Reveal : jamais plus vite qu'un humain (délais, jitter), repli exponentiel sur erreur, coupe-circuit après N erreurs consécutives (arrêt des appels 10 min + alerte), un seul client par compte, User-Agent et en-têtes cohérents avec le vrai client.
- Vers les LLM : timeouts explicites (sens 60 s, cerveau 30 s, voix 30 s), retries bornés, fallback de fournisseur par rôle, cache des descriptions de médias (jamais deux fois le même média).
