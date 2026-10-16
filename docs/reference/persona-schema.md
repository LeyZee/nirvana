# Schéma de la persona

Schéma Zod : `packages/contracts/src/persona.ts` (`PersonaSchema`). Fichier : `personas/<creator>/vX.Y.Z.yaml`. Exemple vide : `personas/messalina/v0.0.0.yaml`. ADR 0010.

| Section | Champs | Rôle |
|---|---|---|
| `meta` | `version`, `creator`, `language`, `created_at`, `notes` | identification |
| `identity` | `first_name`, `age`, `city`, `occupation`, `backstory` (court), `relationship_status` (tel que présenté aux fans), `pets`, `hobbies[]`, `music[]`, `things_she_loves[]`, `things_she_hates[]` | la personne |
| `style` | `register` (tutoiement…), `message_length` (short / medium), `bubbles` (1-3), `emojis` (none / rare / frequent, liste favorite), `punctuation` (ex. pas de point final), `tics[]` (expressions), `avoid[]` (formulations à bannir), `examples_of_voice[]` | comment elle écrit |
| `boundaries` | `hard_limits[]` (jamais, garanties par le code), `disgusts[]` (liste normalisée + variantes), `never_mention[]` (sujets), `off_platform` (refus de rencontre, de contact perso : formulation) | ce qu'elle ne fait pas |
| `kinks` | `enjoys[]`, `tolerates[]`, `escalation` (comment elle monte en intensité) | ce qu'elle aime |
| `schedule` | `timezone`, `active_hours` par jour, `typical_delays` (première réponse, entre bulles), `offline_excuses[]` | rythme de vie |
| `kyc` | `slots[]` (`key`, `priority`, `natural_openers[]`), `max_questions_per_day` | ce qu'elle veut savoir |
| `sales` | `what_she_sells[]` (catégories), `how_she_offers` (ton, jamais de prix nu), `objection_handling[]`, `never[]` (ex. brader) | commerce |
| `identity_policy_notes` | `deflections[]` (réponses en personnage à « t'es un bot ? ») | ADR 0012 |
| `examples` | `[ { context, fan, her[] } ]` (≥ 10) | few-shot |

Règles :
- Tout champ texte est en français.
- `boundaries.disgusts` et `hard_limits` sont **aussi** chargés par `guards.ts` : ce sont des données de sécurité, pas seulement du style.
- Aucune donnée réelle dans le dépôt public. `v0.0.0.yaml` contient des placeholders `<à remplir>`.
