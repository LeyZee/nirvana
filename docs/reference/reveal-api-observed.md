# Reveal : API privée observée

**Statut : vide, à remplir en phase 1 (P1-01, P1-02).** Fichier protégé (`hygiene.md`) : il se complète, il ne se supprime pas.

Toute entrée est anonymisée (identifiants hachés, contenus tronqués, aucune donnée de fan réelle). Chaque endpoint utilisé par `RevealApiConnector` a sa section ici et un scénario FakeReveal.

## Résumé (à remplir)

- Base URL :
- Style (REST / GraphQL) :
- Auth (cookie / bearer / refresh, durée, invalidation) :
- Temps réel (WebSocket / polling, fréquence du client officiel) :
- Anti-bot (Cloudflare / Turnstile / empreinte) :
- Rate limits observés :
- Non-lus et dernier message sans ouvrir la conversation :
- Stabilité des identifiants :
- Ventes PPV (comment elles apparaissent) :
- Envoi de média (upload / URL signée / limites) :
- Scripts natifs (liste, contenu, trace par fan, envoi) :
- Historique (messages, achats, notes) paginable jusqu'au début :
- Notes client (lecture, écriture, concurrence) :
- Âge des fans (vérifié, exposé) :
- Capacités déclarées (`ConnectorCapabilities`) :

Ce qu'on cherche à remplir : `docs/reference/reveal-connector-inventory.md`. Captures : `docs/runbooks/reveal-recording.md`.

## Endpoints

### `GET …` — liste des conversations

- Observé le :
- Requête (en-têtes utiles, paramètres) :
- Réponse (forme, champs utilisés) :
- Pagination :
- Exemple anonymisé :

(dupliquer la section par endpoint)

## Journal des changements observés

| Date | Changement | Impact | Action |
|---|---|---|---|
