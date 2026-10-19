# 2026-10-19 · IP réelle derrière le proxy et limite par compte (G6)

Fait :
- `TRUST_PROXY_HOPS` (config, `.env.example`, défaut 0) règle `trustProxy` de Fastify. Derrière le Traefik de Coolify, la valeur est 1, et `request.ip` est le client, pas le proxy. Les limites de débit et l'audit des clés (`providers`) s'en servent.
- Better Auth lit l'IP dans `x-nirvana-client-ip`, que `authHeaders` réécrit avec `request.ip` à chaque appel. Un `x-forwarded-for` ou un `x-nirvana-client-ip` écrit par le client ne finit plus dans `audit_log`.
- `POST /v1/auth/sign-in/email` a sa propre route : 20 par minute et par IP comme le reste de `/auth`, plus 10 par quart d'heure et par compte (e-mail en minuscules), quelle que soit l'adresse. Au-delà : 429 `sign_in_limited` avec `Retry-After`.
- `security.md` est à jour.

Pas fait : poser `TRUST_PROXY_HOPS=1` dans Coolify au déploiement (Hetzner pas encore en place).

Décisions : la limite par compte prend un compteur à part (`createRateLimit`). `rateLimit()` s'arrête quand le limiteur par IP est déjà passé sur la requête. 10 essais par quart d'heure suffisent à un humain qui se trompe et ralentissent assez une attaque qui change d'adresse.

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, intégration `auth` et `auth-limits` : IP derrière un proxy, en-têtes du client ignorés sans proxy, onzième essai bloqué pour un compte et pas pour un autre.
