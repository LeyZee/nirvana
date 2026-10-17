# Catalogue médias tarifé : offres, échelle de prix, historique par fan
Statut : proposed
Phase : 6
Dépend de : PROPOSED-fan-memory, P1-03
Branche : (à fixer à l'acceptation)

## Objectif
Concevoir puis coder le catalogue que l'agent vend : des médias décrits, regroupés en offres, rangés sur une échelle de prix tenue par le code, jamais vendus deux fois au même fan.

## Contexte à lire
`docs/architecture/data-model.md` (§ Médias, § Commercial), `docs/reference/media-vocabulary.md`, `docs/architecture/ai-engine.md` (§ La politique, point 5), `docs/reference/onlychat-analysis.md`, `docs/roadmap.md` (phase 6). Besoin métier : message de Charles du 17/10 à 17h18, `/mnt/project-files/chatting/methode-chatting.md` §2.3, §3 et §6, `/mnt/project-files/onlychat/README.md` §2 (hors dépôt ; la remise unique du §4 est supprimée).

## Ce qui existe
Conçus : `media_assets`, `media_descriptions` (rôle `sense`, vocabulaire fermé), `media_sends` (anti-doublon par fan, avec le prix). Réservés sans conception : `offers`, `sales`, `scripts`, `script_steps`, `script_runs`, `cards`. Le principe est acté (échelle et planchers en code, pas dans le prompt), le modèle de données ne l'est pas. Reveal a son propre système de scripts : sa forme n'est pas connue avant P1-02.

## Proposition (à valider par Charles avant de coder)
- `price_ladders` : `id`, `creator_id`, `name`, `currency`, `steps` (`[{ rank, label, floor_minor, list_minor }]`), `max_step_ratio` (défaut 2 : un palier ne coûte jamais plus du double du précédent ; tripler a coupé net chez l'ancien bot). Aucune remise : on ne négocie jamais (méthode de chatting, §3).
- `offers` : `id`, `creator_id`, `kind` (`teaser` gratuit | `pack` | `single`), `media_asset_ids[]` (ex. 3 photos et 1 vidéo), `ladder_step_rank`, `caption_brief` (l'idée de la légende, la voix l'écrit), `intensity` (calculée depuis les descriptions), `moment` (`day` | `night` | `any`), `active`.
- **Moment** (Charles, 17/10 à 17h52) : Reveal range scripts et dossiers du Vault en « Jour » ☀️ et « Nuit » 🌙, pour qu'un média corresponde à l'heure à laquelle le fan le reçoit. `moment` est porté par chaque média (`media_assets`), chaque offre et chaque script ; la politique ne propose que ce qui correspond à l'heure locale du fan (fuseau tiré du slot `location`, sinon celui de la créatrice). Les heures qui bornent le jour et la nuit sont un réglage de la créatrice.
- **Description par média** (Charles, 17/10 à 18h01) : l'agent doit pouvoir dire ce qui se passe dans un média du catalogue quand un fan le demande, pour donner envie d'acheter. La description existe déjà (`media_descriptions`, rôle `sense` à l'import, `factual_description` en texte libre et vocabulaire fermé) ; il manque sa validation humaine : `validated_by`, `validated_at` et une correction éventuelle, par Charles ou Messa. Une offre n'est proposable que si tous ses médias ont une description validée ; la voix ne décrit un média qu'à partir de cette description, jamais de l'image elle-même ni de son imagination.
- `sales` : `id`, `creator_id`, `fan_id`, `offer_id` (nullable si inconnue), `amount_minor`, `currency`, `platform_transaction_id` (unique), `detected_at`. Source : `listTransactions` du connecteur ou détection dans les messages.
- `scripts` : Nirvana lit les scripts de Reveal (système natif) au lieu d'en éditer ; un script est une suite d'étapes de paliers croissants avec un teaser entre chaque. `script_runs (fan_id, script_id)` unique, pour ne jamais rejouer un script à un fan. Forme exacte après P1-02.
- Règles en code (politique et gardes) : prix toujours lu dans l'échelle, jamais inventé par le LLM ; plancher jamais franchi ; aucune remise ; même média, même prix pour tous les fans ; un média n'est annoncé que s'il part réellement ; pas d'offre si la mémoire du fan l'interdit (drapeaux, âge non confirmé, cooldown de `persona.strategies.script_launch`).
- Historique par fan : `media_sends` + `sales` + `script_runs`, exposés par le module `fans` (`sentMediaIds`, `purchaseSummary`).

## À faire (après validation)
- ADR « Catalogue et échelle de prix » si la proposition est retenue.
- Contrats, schéma Drizzle et migration, modules `sales` et `scripts`, règles de politique, tests.
- Le catalogue réel de Messa (médias, paliers, prix) reste hors dépôt (ADR 0010) ; les tests utilisent un catalogue fictif.

## Critères d'acceptation
- Tests du domaine : média de nuit refusé à 15 h chez le fan, offre refusée tant qu'une description n'est pas validée, palier ×3 refusé, contre-offre refusée au prix affiché, même prix pour deux fans, script jamais rejoué, média jamais revendu.
- Évals : fan qui refuse le prix, fan qui demande « c'est ton prix le plus bas ? », fan qui a déjà tout acheté (notification « plus de script »).

## Hors périmètre
Upload et stockage des médias, génération de la description par le rôle `sense` (déjà conçue ; seule la validation entre ici), lecture des médias envoyés par les fans (rôle `sense`, autre fiche), interface du catalogue.

## Notes de session
