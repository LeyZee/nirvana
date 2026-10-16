# 0008. Port `PlatformConnector` ; Reveal via session capturée et client API serveur

Statut : accepted
Date : 2026-10-16

## Contexte

Reveal n'a pas d'API publique. Trois façons d'y accéder : A) faire tourner le bot dans l'extension Chrome (DOM, onglet ouvert), B) capturer la session depuis l'extension et appeler l'API privée de Reveal depuis le serveur, C) piloter un navigateur côté serveur (Playwright). OnlyChat, l'outil de référence, fonctionne en B (« tient avec Chrome fermé »). Les CGU de Reveal sur l'automatisation ne sont pas encore lues (à faire par Charles).

## Décision

- Le cœur ne parle aux plateformes qu'à travers le port **`PlatformConnector`** (`docs/architecture/connectors.md`), avec des erreurs typées, des clés d'idempotence, des `capabilities` déclarées, et un **test de contrat** commun à tous les adaptateurs.
- Stratégie Reveal : **B cible**. L'extension sert d'**enregistreur** (phase 1, découverte de l'API) et de **capture de session** (phase 2). **C reste prêt** comme repli derrière le même port si B est bloqué (anti-bot, signatures).
- **FakeReveal** (serveur mock à scénarios) est livré avant le vrai connecteur et reste la base des tests.
- Sortie réseau par une IP française dédiée ; un seul client par compte ; rythme humain ; coupe-circuit sur erreurs et expiration de session.
- La session plateforme est chiffrée en base (AES-256-GCM), jamais loguée, jamais stockée dans l'extension.

## Conséquences

- Le bot tourne sans que le navigateur de Charles soit ouvert ; la fiabilité dépend d'une API, pas d'un DOM.
- Le cœur est testable sans réseau ; chaque plateforme future est un adaptateur plus un test de contrat.
- Risque : Reveal change son API ou durcit l'anti-bot. Parade : l'enregistreur détecte les changements (diff des endpoints), C reprend le relais, le kill switch arrête tout.
- La phase 1 (spike) conditionne la phase 2 ; ses 10 questions sont listées dans `connectors.md`.

## Alternatives rejetées

- **A seul** : pas de 24/7, MV3 tue le service worker, fragile au DOM.
- **C seul** : coût mémoire et fragilité d'un navigateur serveur en permanence ; gardé en repli.
- **Attendre une API officielle** : il n'y en aura pas.
