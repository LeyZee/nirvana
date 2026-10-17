# Schéma de la persona

Schéma Zod : `packages/contracts/src/persona.ts` (`PersonaSchema`, types `Persona`, listes `PERSONA_OPTIONS`, bornes `PERSONA_BOUNDS`, `ageOn`). Fichier : `personas/<creator>/vX.Y.Z.yaml`. ADR 0010.

La structure reprend la fiche créatrice d'OnlyChat, onglet par onglet (décision de Charles, 17/10/2026 : « OnlyChat sont les boss »), ajustée par la méthode de chatting de l'agence (`/mnt/project-files/chatting/methode-chatting.md`, §6, hors dépôt) : curseurs en heures, pas de réglage de négociation, surnoms en liste fermée. Le formulaire du dashboard et l'agent lisent le même schéma et les mêmes listes de valeurs, avec leurs libellés français : le dashboard n'a pas sa propre copie.

Exemples : `personas/messalina/v0.0.0.yaml` (placeholders, la vraie persona est hors dépôt) et `personas/demo/v0.1.0.yaml` (créatrice fictive, pour les tests, les évals et la démonstration).

| Section | Onglet OnlyChat | Champs | Rôle |
|---|---|---|---|
| `meta` | (aucun) | `schema` (1), `version` (semver), `creator`, `language` (`fr`), `created_at`, `notes` | identification |
| `details` | Détails | `first_name`, `date_of_birth` (l'âge en est calculé par `ageOn`, jamais saisi), `gender` (déprécié le 17/10 : facultatif, ignoré, absent de l'écran), `ethnicity`, `timezone` (IANA), `languages[]` (au moins une, sans doublon), `height_cm`, `weight_kg`, `shoe_size_eu`, `hair`, `eyes`, `bra` (`band` 65 à 105 par 5, `cup` A à H), `hobbies[]`, `personality[]` | la personne |
| `additional_info` | Infos en plus | texte libre, 6 000 caractères au plus | identité, voix, séduction, passions, objectifs |
| `behavior` | Comportement | `language_style` (`formal` / `casual`), `language_instructions`, `split_messages`, `pet_names[]` (les seuls surnoms qu'elle donne), `response_delay_minutes` (0 à 60) | comment elle écrit |
| `strategies` | Stratégies | `kyc` (`targets`, `max_messages` 1 à 500, `max_duration_minutes` 10 à 1 440, `min_hours_before_following` 0 à 24 : temps de conversation avant de suivre un fan qui sexualise), `sexualization` (`initiate_after_hours` 0 à 168 : temps de relation avant que l'agent ouvre lui-même la sexualisation), `script_launch` (`cooldown_hours` 0 à 24 entre deux scripts au même fan), `post_offer` (`delay_days` 1 à 60 : relance après un refus) ; chacune a un `style` (`default` / `custom`, `normal` / `custom` pour le lancement) et des `instructions` présentes si et seulement si le style est `custom` | comment elle vend |
| `follow_ups` | Relances | `enabled`, `delays_hours[]` (strictement croissants), `type` (`soft` / `custom`, `text` si `custom`), `nudges` (`enabled`, `delay_minutes`, `max_per_day`, `min_hours_after_conversation`, `delete_previous`) | relances et petits rappels |
| `notifications` | Notifications | `sales`, `agent_disabled`, `no_script_left`, `rate_limited`, `alert_keywords[]` | qui prévenir, quand |
| `limits` | (aucun, écart admis) | `never_do[]`, `never_show[]`, `never_say[]`, `disgusts[]` | ce qu'elle ne fait, ne montre, ne dit jamais |

Règles :
- Tout champ texte est en français. Les valeurs des listes sont en anglais (code), leurs libellés en français (`PERSONA_OPTIONS`).
- Une clé inconnue est refusée : une faute de frappe ne passe jamais en silence.
- La créatrice a au moins 18 ans à la date `meta.created_at`.
- **Appliqué par le code, pas par le prompt** (CLAUDE.md, règle 3) : `response_delay_minutes`, les délais de KYC et de sexualisation, les cooldowns, `delays_hours` et les petits rappels sont lus par la politique ; `limits` et `pet_names` sont chargés par `guards.ts`. Suivre un fan qui sexualise demande aussi son âge confirmé majeur. Ce sont des données de sécurité, pas seulement du style.
- **Mots-clés d'alerte** : toujours actifs, pas d'interrupteur. Un fan qui en écrit un met l'agent en pause pour ce fan et prévient un humain.
- **Écarts admis avec OnlyChat**, tous venus d'une décision : `limits` (règle 3) ; pas de `negotiation` (on ne négocie jamais le prix, règle fixe en code, méthode §3) ; `sexualization.initiate_after_hours` en heures au lieu de `minSexualizationCooldown` (0 à 5, unité non documentée) ; `kyc.min_hours_before_following` et `behavior.pet_names` demandés par Charles ; la politique d'identité vit dans `CreatorSettings.identity_policy`, verrouillée sur `stay_in_character` (ADR 0012), pas dans la persona ; les versions passent par les tests et la validation de Messa (ADR 0010).
- **Ce qui n'est plus dans la persona** : les horaires de vie (réglages de la créatrice, phase 5), les exemples de voix (corpus validé par Messa, nourri par les corrections du playground), les kinks (dans `additional_info`, et ce qui doit être garanti, dans `limits`).
- Valeurs OnlyChat : `FORMAL` / `CASUAL`, `DEFAULT` / `CUSTOM`, `NORMAL`, `SOFT` deviennent les mêmes mots en minuscules. `negotiationStyle` n'est pas importé. Le type des petits rappels (`nudgeType`) n'est pas repris : ses valeurs ne sont pas connues.
- Aucune donnée réelle dans le dépôt : `v0.0.0.yaml` contient des placeholders `<à remplir>`, `demo` est inventée.
