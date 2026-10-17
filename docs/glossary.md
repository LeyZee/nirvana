# Glossaire FR ↔ EN

Le code (identifiants, tables, événements) est en anglais. Les docs, l'interface et les personas sont en français. Ce glossaire fixe la correspondance : on n'invente pas de synonyme.

| Français (docs, UI) | Anglais (code) | Définition |
|---|---|---|
| Créatrice, modèle | `creator` | Le tenant. Une personne dont on gère les comptes et les conversations. « Modèle » dans Imperium ; ici on dit créatrice. |
| Compte plateforme | `platform_account` | Le compte d'une créatrice sur une plateforme (Reveal, OnlyFans, Nirvana). |
| Plateforme | `platform` | Reveal, OnlyFans, Instagram, Nirvana (la nôtre). Valeur d'enum, jamais une logique dans le cœur. |
| Fan | `fan` | Une personne qui écrit à la créatrice sur un compte plateforme. Identifié par `platform_fan_id`. |
| Personne | `person` | (Plus tard) un même humain reconnu sur plusieurs plateformes. `fans.person_id` nullable. |
| Conversation | `conversation` | Le fil 1:1 entre un fan et un compte plateforme. |
| Message | `message` | Un message reçu ou envoyé. `direction: inbound | outbound`, `author: fan | human | ai`. |
| Journal d'événements | `conversation_events` | Historique append-only de tout ce qui arrive à une conversation. Source de vérité. |
| Brouillon, proposition | `draft` | Une réponse proposée par l'IA, en attente d'approbation ou auto-approuvée. |
| Brief | `brief` | La sortie structurée du cerveau qui dit à la voix quoi écrire. |
| Sens | `sense` | Rôle LLM qui décrit les médias. |
| Cerveau | `brain` | Rôle LLM qui analyse et décide. |
| Voix | `voice` | Rôle LLM qui rédige dans la voix de la créatrice. |
| Juge | `judge` | Rôle LLM d'évaluation (hors production). |
| Politique | `policy` | Règles déterministes en code appliquées entre le cerveau et la voix. |
| Gardes | `guards` | Vérifications en code après la voix (dégoûts, répétition, longueur, argent, identité). |
| Repli | `fallback` | Le modèle de secours d'un rôle LLM, utilisé quand le modèle actif refuse, ne répond pas ou n'a pas de clé. |
| Santé (des modèles) | `health` | État des rôles LLM (`ok`, `degraded`, `down`), latences, erreurs, coût du jour face au budget ; alimente le panneau « Modèles IA ». |
| Plafond du jour | `dailyBudget`, `budget_reached` | Dépense IA maximale sur une journée, heure de Paris (20 € par défaut) : alerte à 80 %, au-delà plus aucune génération et les chatteurs reprennent. |
| Playground | `playground` | Conversation d'essai avec la persona par le même chemin que la production (cerveau, voix, gardes), sans aucun envoi possible. |
| Taux de validation | `validationRate` | Part des réponses du bot validées sans retouche parmi les 50 dernières notées, par version de la voix. Objectif 80 % avant tout mode automatique. |
| Calibrage | `calibration` | Noter, corriger ou rejeter les réponses du playground pour faire monter le taux de validation. |
| Le moment | `situation` | Faits écrits par le code pour le cerveau et la voix : heure de la créatrice, jour ou nuit, ancienneté de la relation, montant dépensé. |
| Préréglage de fan | `FanPreset` | Fan fictif du playground (nouveau, chaud, négocie, détresse…) qui teste une partie de la méthode. |
| Test express | `probe` | Script qui vérifie qu'un modèle tient la persona en sexting sans refuser ni avouer être une IA (`pnpm probe`), et lit photos et vidéos sans obéir à leur texte (`pnpm probe:vision`). |
| Piège | `trap` | Message (ou texte d'un média) qui cherche à prouver qu'on parle à une machine : recette, code, consigne, extraction du prompt. Détecté et traité en code (`assessTrap`). |
| Images clés | `keyframes` | Images datées extraites d'une vidéo (une par seconde au plus, quasi-doublons retirés) pour un modèle de vision qui ne lit pas la vidéo. |
| Canari | `canary` | Secret écrit dans chaque prompt système ; une sortie qui le contient a fuité le prompt et est rejetée. |
| Passage à l'humain | `handoff` | La conversation est confiée à un humain ; le bot ne répond plus. |
| Prise en main | `takeover` | Un humain prend la main volontairement. |
| Mode copilote | `copilot` | Le bot propose, un humain approuve. |
| Mode auto | `auto` | Le bot envoie seul pour les catégories autorisées. |
| Fait (mémoire) | `fan_fact` | Une information mémorisée sur un fan, avec source, date, confiance, `kind: declared | inferred`. |
| Résumé fan | `fan_summary` | Résumé opérationnel régénéré. |
| Slot KYC | `kyc_slot` | Une information qu'on cherche à apprendre (prénom, âge, métier…). |
| Persona | `persona` | La fiche versionnée de la créatrice, calquée sur la fiche OnlyChat (détails, infos en plus, comportement, stratégies, relances, notifications), plus ses limites. |
| Infos en plus | `additional_info` | Le texte libre de la persona (6 000 caractères au plus). |
| Limites | `limits` | Ce que la créatrice ne fait, ne montre, ne dit jamais, et ses dégoûts. Chargées par les gardes. |
| Surnom | `pet_name` | Un des surnoms que la créatrice donne aux fans, pris dans la liste fermée de sa persona. |
| Sexualisation | `sexualization` | Le moment où la conversation devient sexy, et la stratégie qui le règle. |
| Suivi d'offre | `post_offer` | Ce que fait l'agent après un achat ou une offre refusée. |
| Mot-clé d'alerte | `alert_keyword` | Un mot qui, écrit par un fan, met l'agent en pause pour ce fan et prévient un humain. |
| Politique d'identité | `identity_policy` | Comment le bot réagit à « t'es un bot ? ». Réglage, voir ADR 0012. |
| Média | `media_asset` | Une photo, vidéo ou audio de la créatrice (catalogue) ou reçue d'un fan. |
| Description de média | `media_description` | La sortie du rôle sens, au vocabulaire Nirvana. |
| Offre | `offer` | Une proposition commerciale (média + prix + plancher). Phase 6. |
| Vente | `sale` | Une transaction détectée sur la plateforme. Montant en centimes + devise. |
| Script | `script` | Séquence d'étapes de vente (structure). Phase 6. |
| Étape | `script_step` | Une étape d'un script (message, médias, prix, pacing). |
| Carton | `card` | Séparateur visuel d'étape (PNG), hérité d'OnlyScript. |
| Structure | `script_structure` | Ossature d'un script (ordre des étapes, médias attendus, intention). |
| Script natif | `platform_script` | Un script de vente stocké sur la plateforme (Reveal), que l'agent lit et déroule. À ne pas confondre avec `script`, notre structure interne. |
| Note client | `fan_note` | La note libre qu'une plateforme attache à un fan, lue et écrite par les chatteurs et l'agent. Distincte de `fan_fact`. |
| Notes du modèle | `creator_note` | Les notes que Reveal affiche à côté de chaque conversation sur la créatrice : sa fiche persona vue par la plateforme. |
| Bundle (PPV) | `bundle` | Le PPV de Reveal : médias floutés vendus (au moins un), prix TTC, tarif réduit optionnel, aperçu gratuit de 10 médias au plus. |
| Coffre | `vault` | Les médias de la créatrice stockés sur la plateforme, réutilisables à l'envoi. |
| Capture | `recording` | Un enregistrement anonymisé du trafic entre le site d'une plateforme et ses serveurs (HAR ou enregistreur de l'extension). |
| Fan test | `test_fan` | Un compte fan qui appartient à l'agence, seule cible autorisée des écritures pendant les captures et les tests manuels. |
| Relance | `follow_up` | Message envoyé après un silence du fan. |
| Petit rappel | `nudge` | Rappel court quand le fan a lu sans répondre (« nudge » d'OnlyChat). |
| Cooldown | `cooldown` | Délai pendant lequel le bot ne pousse pas de vente. |
| Connecteur | `connector` | Adaptateur d'une plateforme derrière le port `PlatformConnector`. |
| Clé de fournisseur | `provider_credential` | Clé d'API d'un fournisseur IA (xAI, Google, ElevenLabs…), saisie dans Réglages › Modèles IA et chiffrée en base (ADR 0016). À l'écran, on parle de « services », jamais de « connecteurs ». |
| Session (plateforme) | `platform_session` | Les jetons/cookies capturés qui permettent au connecteur d'agir. |
| Interrupteur d'arrêt | `kill_switch` | Arrêt global, par créatrice ou par conversation. |
| Chatteur | `operator` | Humain qui chatte ou supervise (vocabulaire Imperium : chatteur). |
| Fiche de tâche | `task card` | Une unité de travail pour une session (`docs/sessions/tasks/`). |
| Fiche proposée | `proposed` | Fiche écrite par une session, sans ID, en attente de l'accord de Charles. |
| Bulle | `bubble` | Un message envoyé d'un coup ; un draft est une liste de bulles. |
| Projection | `projection` | Colonne d'état dérivée du journal d'événements, reconstructible (ADR 0007). |
| Outbox | `domain_events` | Table append-only des événements qu'un autre module consomme (ex. `draft_created` lu par `supervision`). |
| Racine de composition | `composition root` | `apps/api/src/composition-root.ts` : le seul endroit qui construit les modules et les branche entre eux. |
| Battement | `heartbeat` | Ligne écrite par le worker toutes les 30 s (`worker_heartbeats`), lue par `/ready`. |
| Identifiant de corrélation | `correlationId` | Le `x-request-id` d'une requête, propagé aux jobs, appels LLM et logs qu'elle déclenche. |
| Playground | `playground` | Bac à sable de conversation : on parle au bot (soi-même, fan simulé ou rejeu) par le même chemin que la production, sans rien envoyer sur une plateforme. Proposé dans `brainstorm/06`. |
| Vitrine | `showcase` | Page de démonstration des composants du design system (dev seulement). Ne pas confondre avec le playground. |
| Fan simulé | `simulated_fan` | Fan joué par une IA d'après un profil, dans le playground. |
| Compte fan de test | `test_fan_account` | Vrai compte fan sur une plateforme, tenu par nous, pour tester envois et ventes sans toucher un vrai fan. |
| Liste blanche d'envoi | `send_allowlist` | Fans vers lesquels le connecteur accepte d'envoyer tant qu'elle n'est pas vide (phase 2). |
| Enregistreur | `recorder` | Fonction de l'extension qui note les échanges réseau du site d'une plateforme, anonymisés. |

## Noms à ne pas utiliser

- `model` pour désigner une créatrice (confusion avec modèle LLM) → `creator`.
- `user` pour un fan → `fan`. `user` désigne un utilisateur du dashboard.
- `bot` dans le code → `agent` ou le rôle précis.
- `client` pour un fan (vocabulaire Imperium « relation client ») → `fan`.
