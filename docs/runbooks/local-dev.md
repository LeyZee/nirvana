# Lancer le CRM en local

Pour essayer le dashboard sur son PC (Windows, macOS ou Linux), avec une base Postgres locale. Rien ne part vers Reveal ni vers un fan : sans connecteur (P0-06), aucun message n'entre ni ne sort. Parcours vérifié le 17/10 sur le code de P0-05 (migration, compte, connexion, `/ready`), avec un Postgres local plutôt que Docker.

## Une fois

1. Installer **Node 22.13 ou plus** (`.nvmrc`), **Docker Desktop**, puis activer pnpm :

   ```powershell
   corepack enable
   ```

2. Récupérer le code et les dépendances, depuis le dossier du dépôt :

   ```powershell
   git pull
   pnpm install
   ```

3. Créer `.env` à partir de l'exemple, puis y mettre trois secrets aléatoires :

   ```powershell
   Copy-Item .env.example .env
   node -e "const r=()=>require('crypto').randomBytes(32).toString('base64');console.log('AUTH_SECRET='+r());console.log('CREDENTIALS_ENCRYPTION_KEYS=v1:'+r());console.log('SESSION_ENCRYPTION_KEYS=v1:'+r())"
   ```

   La commande affiche trois lignes : chacune remplace dans `.env` la ligne qui commence par le même nom.
   - `AUTH_SECRET` signe les cookies du dashboard (Better Auth).
   - `CREDENTIALS_ENCRYPTION_KEYS` chiffre les clés d'IA collées dans Réglages › Modèles IA › Services. Sans elle, ces clés restent en mémoire et disparaissent à chaque redémarrage.
   - `SESSION_ENCRYPTION_KEYS` chiffre la session Reveal que l'extension déposera.
   - Ces clés ne se changent plus ensuite : une clé perdue rend illisible ce qu'elle a chiffré.

   Les autres valeurs de l'exemple conviennent en local. Les mots de passe `change-me` sont ceux de la base Docker. `WEB_ORIGIN` et `AUTH_BASE_URL` pointent sur le dashboard (`http://localhost:5173`). `EXTENSION_DEVICE_TOKEN` attend l'extension et peut rester tel quel.

4. Démarrer Postgres et créer les tables :

   ```powershell
   docker compose up -d
   pnpm db:migrate
   ```

   `db:migrate` doit finir par `Migrations applied.`

5. Créer son compte (il n'y a pas d'inscription publique) ; le mot de passe est demandé ensuite, 12 caractères minimum :

   ```powershell
   pnpm owner:create --email charles@example.com --name Charles
   ```

## À chaque fois

```powershell
docker compose up -d
pnpm dev:crm
```

`dev:crm` lance l'API (port 3000, avec le worker dans le même processus) et le dashboard (port 5173). Ouvrir **http://localhost:5173** et se connecter. `pnpm dev` lance en plus l'extension Chrome en mode développement.

Pour vérifier l'API seule : http://localhost:3000/ready doit répondre `"status":"ready"`.

## Envois et arrêt d'urgence

Un compte plateforme ne peut rien envoyer tant que sa garde d'écriture est fermée (`connector_config.writes`, à `false` par défaut) : un brouillon approuvé échoue alors en `connector_writes_disabled`, sans rien envoyer. On ne l'ouvre que sur le compte fan de test, à la main, en base.

Trois commandes d'exploitation, chacune laisse une ligne dans `audit_log` :

```powershell
pnpm ops:kill-switch --on --scope global --reason "essai"   # plus aucune réponse ni envoi ; --off pour lever
pnpm ops:revoke-sessions --email charles@example.com        # déconnecte le dashboard (sans --email : tout le monde)
pnpm ops:reencrypt-sessions                                 # après une rotation de SESSION_ENCRYPTION_KEYS
```

## Si ça coince

| Symptôme | Cause probable | Geste |
|---|---|---|
| `pnpm install` refuse la version de Node | Node trop ancien | Installer Node 22.13 ou plus |
| `db:migrate` : `ECONNREFUSED` | Postgres pas démarré | `docker compose up -d`, attendre 10 s |
| `db:migrate` : `password authentication failed` | `.env` modifié ou ancien volume Docker | Remettre `change-me` dans les deux URL, ou repartir d'une base vide (ci-dessous) |
| L'API s'arrête au démarrage avec une erreur de configuration | Variable manquante ou invalide dans `.env` | Lire le nom de la variable dans le message, comparer avec `.env.example` |
| Connexion refusée avec un bon mot de passe | `AUTH_BASE_URL` ou `WEB_ORIGIN` ne valent pas `http://localhost:5173` | Corriger `.env`, relancer `pnpm dev:crm` |
| `/ready` répond `"worker":false` | Le worker n'est pas lancé | Vérifier `NIRVANA_INLINE_WORKER=1` dans `.env` |

Repartir d'une base vide efface toutes les données locales (jamais en production) : `docker compose down -v`, puis les étapes 4 et 5.
