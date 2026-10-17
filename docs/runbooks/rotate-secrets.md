# Rotation des secrets

Secrets du système (liste de référence dans `.env.example`) : clés LLM par fournisseur (dev seulement : en production elles sont dans le dashboard), `CREDENTIALS_ENCRYPTION_KEYS`, `DATABASE_URL` (rôle app) et rôle admin, `SESSION_ENCRYPTION_KEYS` (AES-256-GCM des sessions plateforme, clés versionnées), secret Better Auth, clés VAPID, DSN Sentry, clés Langfuse, jeton d'appareil de l'extension, identifiants S3, jeton Cloudflare Access (hors `.env` : il vit dans Cloudflare, pas sur le serveur).

## Procédure générale

1. **Générer** le nouveau secret chez le fournisseur (ou `openssl rand -base64 32` pour les clés internes).
2. **Déployer** le nouveau secret dans Coolify (variables d'environnement) ; pour les clés internes, période de double validité si le code la supporte (voir ci-dessous).
3. **Redémarrer** api et worker (`/ready` vert).
4. **Révoquer** l'ancien secret chez le fournisseur.
5. **Vérifier** : un appel LLM de test, un envoi de test, une connexion dashboard.
6. **Tracer** : entrée LOG (Incidents ou Opérations), sans la valeur du secret.

## Cas particuliers

- **`SESSION_ENCRYPTION_KEYS`** : les sessions plateforme en base sont chiffrées avec l'ancienne clé. Le code supporte `SESSION_ENCRYPTION_KEYS="v2:<nouvelle>,v1:<ancienne>"` (déchiffre avec les deux, chiffre avec la première). Déployer, lancer `pnpm ops:reencrypt-sessions`, puis retirer `v1`.
- **`CREDENTIALS_ENCRYPTION_KEYS`** (clés des services IA, ADR 0016) : même format. Mettre `v2:<nouvelle>,v1:<ancienne>`, déployer, puis dans Réglages › Modèles IA cliquer « Vérifier maintenant » sur chaque service : une clé vérifiée est réenregistrée avec `v2` (colonne `key_version`). Retirer `v1` seulement quand plus aucune ligne de `provider_credentials` ne l'utilise ; sinon le service passe à « clé à remplacer » et il faut recoller sa clé. Les jetons des bots Telegram (`telegram_bots`) sont rescellés tout seuls au redémarrage de l'API et du worker ; vérifier que plus aucune ligne n'a `key_version = 'v1'` avant de retirer `v1`.
- **Clé d'un service IA** (Grok, Gemini, ElevenLabs) : la révoquer dans la console du fournisseur, en créer une, la coller dans Réglages › Modèles IA. L'ancienne reste en service jusqu'à ce que la nouvelle soit vérifiée.
- **Rôle Postgres** : créer un nouveau mot de passe via Neon, mettre à jour `DATABASE_URL`, redémarrer, puis seulement révoquer. Pas l'inverse.
- **Jeton d'appareil extension** : régénérer depuis le dashboard, le coller dans l'extension (popup → Paramètres). L'ancien est invalidé immédiatement.
- **Clé LLM fuitée** : révoquer **d'abord** (le coût d'un abus est immédiat), puis régénérer ; le coupe-circuit budget limite les dégâts entre-temps.
- **Secret commité par erreur** : `gitleaks` l'a normalement bloqué. S'il est passé : considérer le secret compromis, le révoquer, puis purger l'historique (`git filter-repo`) et forcer la mise à jour de tous les clones. Noter l'incident.

## Calendrier

Rotation planifiée tous les 6 mois pour les clés internes ; sur événement pour le reste. Rappel dans `docs/roadmap.md` (maintenance).
