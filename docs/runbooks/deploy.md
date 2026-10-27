# Déploiement en production

Mettre Nirvana en service sur le VPS (Hetzner, Coolify), le mettre à jour, revenir en arrière. Décisions : ADR 0027 (images, compose, limiteur) et ADR 0005 (Neon). Tout ce qui suit se fait dans Coolify, Neon et un terminal sur le serveur ; rien ne passe par un fichier du dépôt.

**Pas encore joué** : les étapes Neon et Coolify suivent leur documentation et la répétition locale (§ 6), pas une vraie mise en service. La première mise en service les vérifie ; tout écart se corrige ici, dans la même journée.

Rien n'envoie à un fan tant que `connector_config.writes` n'est pas ouvert pour son compte (ADR 0018) : une mise en service ne parle à personne.

## Ce qui tourne

| Service | Image | Rôle |
|---|---|---|
| `migrate` | `apps/api/Dockerfile` | applique les migrations, puis s'arrête ; rien d'autre ne démarre s'il échoue |
| `api` | même image | l'API, `/health` et `/ready` |
| `worker` | même image, `node dist/worker.js` | les jobs (Graphile Worker), jamais de HTTP |
| `web` | `apps/web/Dockerfile` | le dashboard, et `/v1/` renvoyé vers l'API : **seul service public** |

Le tout est décrit par `docker-compose.prod.yml`. L'API n'a pas de domaine : le navigateur l'atteint par `https://<domaine>/v1/`, à travers le nginx de `web`.

## 1. Première mise en service

### 1.1 Base Neon

1. Neon → nouveau projet, région Europe (Francfort), Postgres 16. PITR : 7 jours au moins. « Scale to zero » **désactivé** (le worker écoute la base en continu).
2. Le rôle propriétaire créé par Neon sert de rôle admin (`nirvana_admin` dans la doc). Noter sa chaîne de connexion **directe** (sans `-pooler` dans l'hôte) : c'est `DATABASE_ADMIN_URL`.
3. Créer le rôle applicatif, sans contournement de RLS, dans l'éditeur SQL de Neon, connecté avec le rôle admin. Mot de passe : `openssl rand -base64 24`, jamais réutilisé.

   ```sql
   CREATE ROLE nirvana_app LOGIN PASSWORD '<mot de passe>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
   GRANT CONNECT ON DATABASE neondb TO nirvana_app;
   GRANT USAGE ON SCHEMA public TO nirvana_app;
   ```

   (Remplacer `neondb` par le nom de la base.) Les migrations donnent ensuite à `nirvana_app` ses droits table par table.
4. `DATABASE_URL` = la même chaîne directe, avec `nirvana_app` et son mot de passe, et `?sslmode=require`.

Le pooler de Neon (hôte en `-pooler`) est interdit : Graphile Worker a besoin de `LISTEN/NOTIFY`.

### 1.2 Coolify

1. Coolify → Projet « Nirvana » → Ressource → **Docker Compose**, depuis le dépôt GitHub `LeyZee/nirvana`, branche `main`, fichier `docker-compose.prod.yml`.
2. Domaine : sur le service **`web` seulement**, port 8080 (ex. `https://app.<domaine>`). Aucun domaine sur `api`, `worker`, `migrate`.
3. Cocher « Include Source Commit in Build » : `SOURCE_COMMIT` devient le tag de l'image et `RELEASE` (Sentry, battement du worker).
4. Déploiement automatique sur push de `main` : oui. `main` ne change que par une PR verte.

### 1.3 Variables

Toutes dans Coolify → Environment Variables, marquées « secret » quand c'est un secret. La liste de référence est `.env.example` ; en production :

| Variable | Valeur |
|---|---|
| `DATABASE_URL`, `DATABASE_ADMIN_URL` | § 1.1 |
| `SESSION_ENCRYPTION_KEYS` | `v1:` + `openssl rand -base64 32` |
| `CREDENTIALS_ENCRYPTION_KEYS` | `v1:` + une **autre** sortie de `openssl rand -base64 32` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_BASE_URL`, `WEB_ORIGIN` | l'URL publique du dashboard, la même pour les deux (`https://app.<domaine>`) |
| `EXTENSION_DEVICE_TOKEN` | `openssl rand -hex 24` (48 caractères) |
| `TRUST_PROXY_HOPS` | `2` (le proxy de Coolify, puis le nginx de `web`) ; défaut du compose |
| `PLAYGROUND_PERSONA_PATH` | chemin **dans le conteneur** de la persona réelle (§ 1.5) ; sans lui, aucun brouillon pour un vrai fan |
| `SENTRY_DSN`, `LANGFUSE_*`, `S3_*`, `VAPID_*` | facultatifs, vides tant que le service n'existe pas |

Les clés des services IA (xAI, Google, Mistral, ElevenLabs) ne sont **pas** des variables en production : elles se collent dans Réglages › Modèles IA › Services (ADR 0016). Les deux clés de chiffrement se gardent aussi hors du serveur (gestionnaire de mots de passe) : les perdre rend illisibles les sessions et les clés stockées.

### 1.4 Premier déploiement

1. Coolify → Deploy. Ordre attendu dans les journaux : `migrate` « Migrations applied. » et sort avec 0, puis `api` et `worker`, puis `web`.
2. Vérifier :
   - `https://app.<domaine>/` affiche l'écran de connexion ;
   - Coolify → `api` → Terminal : `wget -qO- http://127.0.0.1:3000/ready` → `"status":"ready"` avec `database`, `migrations` et `worker` à `true`.
3. Créer le compte propriétaire (pas d'inscription publique), Coolify → `api` → Terminal :

   ```sh
   node dist/scripts/create-owner.js --email <e-mail> --name <nom>
   ```

   Le mot de passe se tape deux fois, sans écho (12 caractères au moins).
4. Se connecter au dashboard, créer la créatrice dans Créatrices (ou `node dist/scripts/create-creator.js --name <nom>`).

### 1.5 Persona réelle

La persona réelle ne vit jamais dans le dépôt (ADR 0010). Coolify → service `api` → Storages → montage de fichier : chemin `/data/persona/persona.yaml`, contenu = le YAML. Même montage sur `worker` (c'est lui qui écrit les brouillons). Puis `PLAYGROUND_PERSONA_PATH=/data/persona/persona.yaml` et redéployer. Pour l'enregistrer comme version de la créatrice :

```sh
node dist/scripts/persona-validate.js /data/persona/persona.yaml
node dist/scripts/persona-load.js /data/persona/persona.yaml --activate
```

## 2. Mettre à jour

Une PR fusionnée dans `main` déclenche le déploiement. Rien à faire à la main, sauf vérifier : Coolify → Deployments → dernier statut, puis `/ready`.

- Les migrations passent avant le nouveau code (`migrate`), en expand/contract (`operations.md`) : l'ancien code tourne encore sur le nouveau schéma pendant la bascule.
- Un `migrate` en échec arrête le déploiement : l'ancienne version reste en ligne. Lire son journal, corriger par une nouvelle PR. Ne jamais modifier une migration déjà appliquée.
- L'arrêt du worker est propre : SIGTERM, le job en cours a 25 s pour finir.

## 3. Revenir en arrière

1. Coolify → Deployments → la version précédente → **Redeploy**. Le code revient ; le schéma reste (expand/contract : l'ancien code le supporte).
2. `/ready`, puis une connexion au dashboard.
3. Si une migration a abîmé des données (rare, et jamais sans un test qui l'aurait vu) : `restore.md` § A (retour à un instant T avec Neon).
4. Noter l'incident (`docs/sessions/LOG.md`, section Incidents).

## 4. Sauvegardes

- **PITR Neon** (§ 1.1) : retour à n'importe quel instant des 7 derniers jours. C'est la sauvegarde en service dès le premier jour ; procédure dans `restore.md` § A.
- **Export quotidien chiffré hors Neon** (`operations.md`) : **pas encore en place**. Il faut un job (`pg_dump`, chiffrement `age`, envoi vers un bucket) et une clé de déchiffrement gardée hors du serveur. À faire avant la mise en service de la paie, et dans tous les cas avant d'y mettre des données réelles qu'on ne pourrait pas recréer.
- Les volumes du serveur ne contiennent rien d'irremplaçable : `training` (notes du playground) et la persona montée (dont l'original est hors serveur).

## 5. Coupe-circuit

Couper d'abord, comprendre ensuite (`incident.md`). Depuis le dashboard : Supervision → « Tout arrêter ». Sans dashboard, Coolify → `api` → Terminal :

```sh
node dist/scripts/ops-kill-switch.js --on --scope global --reason "<raison>"
node dist/scripts/ops-kill-switch.js --off --scope global --reason "<raison>"
```

Les autres commandes d'exploitation des runbooks (`pnpm ops:revoke-sessions`, `pnpm ops:reencrypt-sessions`, `pnpm ops:reencrypt-credentials`, `pnpm db:rebuild-projections`) ont leur équivalent dans l'image : `node dist/scripts/<nom>.js` (`ops-revoke-sessions`, `ops-reencrypt-sessions`, `ops-reencrypt-credentials`, `rebuild-projections`), mêmes arguments.

Arrêter tout le service, en dernier recours : Coolify → Stop. Les messages reçus pendant l'arrêt sont relus au redémarrage par la réconciliation.

## 6. Répétition locale

Avant une première mise en service, ou pour tester un changement du compose : `docker-compose.prod.yml` (en-tête) donne la commande, contre le Postgres de développement. Le job CI `images` fait la même chose à chaque PR.
