# 0007. Journal d'événements de conversation comme source de vérité

Statut : accepted
Date : 2026-10-16

## Contexte

Il faut pouvoir répondre à « pourquoi le bot a dit ça ? », rejouer l'historique pour les évals, auditer les prises en main, reconstruire un état après un bug, et nourrir les statistiques sans instrumenter chaque écran. Les prédécesseurs n'avaient qu'un état courant.

## Décision

- Table **`conversation_events`** append-only (`conversation_id`, `seq`, `type`, `payload`, `actor`, `correlation_id`), liste fermée de types dans `packages/contracts`.
- **Toute** modification de `conversations`, `drafts`, `messages` passe par une fonction de `conversations/application` qui écrit l'événement correspondant **dans la même transaction**. Pas d'`UPDATE` nu.
- Les tables d'état (`conversations.state`, `drafts.status`, `fans.kyc_state`, etc.) sont des **projections** : pratiques pour les requêtes, reconstructibles depuis le journal (`pnpm db:rebuild-projections <conversation_id>`, outil livré en P0-05).
- Un module tiers qui doit réagir (supervision, fans, sales) s'abonne aux événements via un job de distribution (outbox), pas par couplage direct.
- Les événements ne contiennent pas de secrets ni de contenu média, seulement des identifiants et du texte de message.
- **Lecture de l'outbox** (`domain_events`, ajouté le 17/10, revue à froid G10) : la table est append-only comme le journal ; personne n'y marque une ligne « traitée ». Chaque module consommateur garde **son propre curseur** dans sa propre table et relit une fenêtre derrière lui, parce qu'une transaction validée plus tard peut porter un `created_at` plus ancien que le curseur ; ce qu'il en tire est idempotent (clé unique par événement et destinataire). Un consommateur est réveillé par un déclencheur qui ne fait jamais échouer l'écriture de l'outbox et rattrapé par un job périodique. Premier consommateur : le module `telegram` (`telegram_state.scan_cursor`, déclencheur `domain_events_telegram_scan`, ADR 0020). Un lecteur générique (table de curseurs partagée) viendra avec le deuxième consommateur, pas avant.

## Conséquences

- Traçabilité totale ; évals et statistiques gratuites ; debugging par relecture.
- Coût : discipline (une fonction par transition, testée) et volume (prévu : partition par mois au-delà de 10 M de lignes, `operations.md`).
- Les `fan_facts` suivent le même esprit (append + `superseded_by`).

## Alternatives rejetées

- **État courant seulement** : impossible d'expliquer une décision passée, évals à reconstruire à la main.
- **Event sourcing complet (pas de tables d'état)** : requêtes du dashboard pénibles, complexité inutile. On garde les projections.
