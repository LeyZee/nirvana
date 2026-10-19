# 2026-10-19 · Verrou serveur de l'Automatique (Bilan, revue 09 B3)

Fait : le verrou de l'ADR 0019, appliqué par le serveur.
- Règle unique dans `packages/contracts/src/automatic.ts` (déplacée depuis `supervision/domain/automatic.ts`, avec son test) : `liveRate`, `automaticGate`, `AutomaticMissingSchema`, `AutomaticGateSchema`, `BLIND_TEST_TARGET`.
- Lecture unique dans `conversations` (`application/automatic.ts`, `readAutomaticGate`) : brouillons décidés et dernier test à l'aveugle de la version active. Le Dashboard l'affiche par le port `AutomaticView`, sans recalculer.
- Version active de la voix définie une seule fois dans la racine de composition, passée à `conversations` et à `supervision`.
- Les deux portes fermées : `PUT /v1/agent/mode` (Automatique lève l'interrupteur de la créatrice et passe ses conversations en automatique) et `POST /v1/conversations/:id/mode`. Refus en 409 `agent_mode_conflict` avec `details.missing`. `DomainError` porte désormais des `details`, renvoyés par le serveur.
- `POST /v1/creators/:id/blind-tests { rate }` : propriétaire, connexion de moins de 10 minutes, version et date posées par le serveur, ligne d'audit `blind_test.record`.
- Retour en copilote sans demander, avec un seul événement `automatic_closed` : après chaque décision d'un chatteur, après chaque test à l'aveugle, au début de `conversation.respond` (avant le moteur).
- Migration 0008 (additive) : table `blind_tests` (append-only, RLS forcée) et `automatic_closed` dans les deux listes d'événements.

Pas fait : l'alerte Telegram de `automatic_closed` (fil Telegram, après la fusion). La relecture du verrou par `send` avant un envoi automatique : aucun envoi automatique n'existe encore, la règle est écrite dans `message-flow.md` §6.

Décisions : pas de ré-authentification pour passer en Automatique (défaut fixé par le coordinateur faute de décision de Charles, écrit dans l'ADR 0019). Le taux du test à l'aveugle est stocké en dixièmes de pour cent (`rate_per_mille`) : pas de flottant sur un seuil. Le verrou de la créatrice est pris avant ceux des conversations dans tout changement de mode, donc la fermeture tourne dans sa propre transaction, jamais sous le verrou d'une conversation.

Relectures : agent (partie `supervision`, demandée par le coordinateur).

Découvertes : une conversation créée pendant que la créatrice est en Automatique naît en copilote ; il faudra un mode au niveau de la créatrice quand l'envoi automatique existera. La politique RLS de `kill_switches` (ligne globale écrivable par une créatrice) reste pour G16.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, intégration `automatic-lock` (5 cas : deux portes, test à l'aveugle, ouverture, fermeture au respond, fermeture par un test raté), `agent-mode`, `dashboard`, `conversations`, RLS.
