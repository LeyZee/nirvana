# 0003. Cœur agnostique de la plateforme (y compris notre future plateforme sans abonnement)

Statut : accepted
Date : 2026-10-16

## Contexte

La première cible est Reveal, sans API publique. Charles veut ensuite OnlyFans, Instagram, et à terme **sa propre plateforme privée dédiée à une seule créatrice, sans système d'abonnement**. Si le cœur épouse le modèle de Reveal (abonnés, PPV, session web), chaque nouvelle plateforme sera une réécriture.

## Décision

- Les modules `conversations`, `fans`, `persona`, `agent`, `media`, `supervision` ne connaissent aucune plateforme. Ils manipulent `platform_account`, `fan`, `conversation`, `message`, `sale`, avec des identifiants externes opaques.
- Tout accès à une plateforme passe par le port `PlatformConnector` (ADR 0008). Les connecteurs déclarent des `capabilities` ; le cœur s'y adapte.
- **Aucune notion d'abonnement dans le cœur.** Les ventes sont typées (`ppv_unlock`, `tip`, `custom_request`, `credit_purchase`, `chat_unlock`, `other`). Toute donnée spécifique à une plateforme va dans un `platform_meta jsonb` ou dans le module `connectors`.
- Les fans sont identifiés par compte plateforme, avec `person_id` réservé pour relier les comptes d'une même personne entre plateformes.
- Les médias portent des droits (`rights`) et un anti-doublon par fan, pas par plateforme ; stockage objet S3-compatible avec URL signées.
- `users` (opérateurs du dashboard) et les futurs `fan_accounts` (plateforme propre) sont des tables distinctes.
- Détail des règles : `docs/architecture/own-platform.md`.

## Conséquences

- La plateforme propre se branche par un connecteur **in-process**, sans scraping ni session : c'est là que l'architecture paie le plus.
- Coût : quelques abstractions qui semblent superflues tant qu'il n'y a que Reveal. Elles sont le prix de l'évolutivité demandée.
- À surveiller en revue de PR : toute colonne « spécifique Reveal » ajoutée au cœur.

## Alternatives rejetées

- **Construire pour Reveal, généraliser plus tard** : c'est ainsi qu'on obtient un spaghetti ; la généralisation après coup coûte plus cher que les ports dès le départ.
