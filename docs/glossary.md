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
| Taux au playground | `playgroundRate` | Part des réponses du playground validées sans retouche parmi les 50 dernières notées, par version de la voix. Sert à calibrer ; n'ouvre jamais le mode Automatique (ADR 0019). |
| Taux en réel | `liveRate` | Part des brouillons des vrais fans approuvés sans modification parmi les 200 derniers décidés, par créatrice, version de la voix et persona active (ADR 0022). 80 % sur au moins 100 brouillons, avec le test à l'aveugle, ouvrent le mode Automatique (ADR 0019). |
| Test à l'aveugle | `blindTest` | La créatrice juge des réponses sans savoir lesquelles viennent du bot ; validé à 80 % « sans retouche » au moins, il est l'une des conditions du mode Automatique. |
| Calibrage | `calibration` | Noter, corriger ou rejeter les réponses du playground pour faire monter le taux au playground. |
| Le moment | `situation` | Faits écrits par le code pour le cerveau et la voix : heure de la créatrice, jour ou nuit, ancienneté de la relation, montant dépensé. |
| Préréglage de fan | `FanPreset` | Fan fictif du playground (nouveau, chaud, négocie, détresse…) qui teste une partie de la méthode. |
| Test express | `probe` | Script qui vérifie qu'un modèle tient la persona en sexting sans refuser ni avouer être une IA (`pnpm probe`), et lit photos et vidéos sans obéir à leur texte (`pnpm probe:vision`). |
| Piège | `trap` | Message (ou texte d'un média) qui cherche à prouver qu'on parle à une machine : recette, code, consigne, extraction du prompt. Détecté et traité en code (`assessTrap`). |
| Images clés | `keyframes` | Images datées extraites d'une vidéo (une par seconde au plus, quasi-doublons retirés) pour un modèle de vision qui ne lit pas la vidéo. |
| Canari | `canary` | Secret écrit dans chaque prompt système ; une sortie qui le contient a fuité le prompt et est rejetée. |
| Passage à l'humain | `handoff` | La conversation est confiée à un humain ; le bot ne répond plus. |
| Prise en main | `takeover` | Un humain prend la main volontairement (« Reprendre la main » dans Suivi) ; il répond alors dans Reveal, l'agent n'écrit plus à ce fan. |
| Rendre la main | `release` | Fin d'une prise en main ou d'un passage à l'humain : l'agent répond de nouveau à partir du prochain message du fan. |
| Mode copilote | `copilot` | Le bot propose, un humain approuve. |
| Mode auto | `auto` | Le bot envoie seul pour les catégories autorisées. |
| Fait (mémoire) | `fan_fact` | Une information mémorisée sur un fan, avec source, date, confiance, `kind: declared | inferred`. |
| Note du chatteur | `operator_note` | Ce qu'un chatteur veut qu'elle retienne d'un fan, laissé en rendant la main ; gardé comme un fait de cette catégorie, jamais proposé par un modèle. |
| Résumé fan | `fan_summary` | Résumé opérationnel régénéré. |
| Slot KYC | `kyc_slot` | Une information qu'on cherche à apprendre : une ligne du canevas de notes de Reveal (Prénom, Localisation, Âge, Métier, Passions, Envies, Situation), liste fermée `KycSlotSchema`. |
| Drapeau du fan | `fan_flag` | Une limite du fan (`fans.flags`, `FanFlagsSchema`) : âge confirmé, ventes gelées et leur raison, plafond de dépense, fragile, pas d'explicite, ne plus écrire. Lue par la politique avant toute offre, posée par la politique ou un humain, jamais par un modèle seul. |
| Persona | `persona` | La fiche versionnée de la créatrice, calquée sur la fiche OnlyChat (détails, infos en plus, comportement, stratégies, relances, notifications), plus ses limites. |
| Version de persona | `persona_version` | Un état enregistré de la persona d'une créatrice. Une seule est active, celle avec laquelle l'agent écrit ; le CRM enregistre des versions qui restent inactives tant qu'elles ne sont pas activées (ADR 0010). |
| Infos en plus | `additional_info` | Le texte libre de la persona (6 000 caractères au plus). |
| Limites | `limits` | Ce que la créatrice ne fait, ne montre, ne dit jamais, et ses dégoûts. Chargées par les gardes. |
| Surnom | `pet_name` | Un des surnoms que la créatrice donne aux fans, pris dans la liste fermée de sa persona. |
| Sexualisation | `sexualization` | Le moment où la conversation devient sexy, et la stratégie qui le règle. |
| Suivi d'offre | `post_offer` | Ce que fait l'agent après un achat ou une offre refusée. |
| Mot-clé d'alerte | `alert_keyword` | Un mot qui, écrit par un fan, met l'agent en pause pour ce fan et prévient un humain. |
| Rester en personnage | `asks_if_bot`, `ai_disclosure` | Le bot ne dit jamais qu'il est une IA : à « t'es un bot ? » (`asks_if_bot`), il répond en personnage, et la garde `ai_disclosure` bloque tout aveu. Fixé dans le code, pas un réglage (ADR 0021). |
| Média | `media_asset` | Une photo, vidéo ou audio de la créatrice (catalogue) ou reçue d'un fan. |
| Description de média | `media_description` | La sortie du rôle sens, au vocabulaire Nirvana. |
| Offre | `offer` | Une proposition commerciale (média + prix + plancher). Phase 6. |
| Budget nul | `hasNoBudget` | Drapeau posé par le code quand le fan dit ne pas pouvoir payer : plus aucune offre ni bouderie ni relance de vente tant qu'il ne revient pas de lui-même vers le payant. |
| Délai entre deux scripts | `cooldownHours` | Temps minimum entre deux scripts proposés à un même fan, lu dans la persona (`strategies.script_launch.cooldown_hours`, réglable par créatrice) ; après, un script ne part que si le fan sexualise de nouveau (`offerDecision`). |
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
| Jeton d'appareil | `device token` | Secret de l'extension pour déposer une session (`POST /v1/connector/sessions`, `EXTENSION_DEVICE_TOKEN`). |
| Composeur | `DraftComposer` | Le port par lequel `conversation.respond` demande un brouillon au moteur ; il rend des bulles ou une retenue (`held`) avec sa raison. |
| Coupe-circuit | `breaker` | Pause d'un compte plateforme après N relèves ratées d'affilée (`connector_config`), avec un événement `error`. |
| Garde d'écriture | `writes` | Réglage d'un compte plateforme (`connector_config.writes`, fermé par défaut) : fermé, aucun envoi ne part, seule la lecture continue. |
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
| Mode démo | `isDemo` | Écran du playground servi par des réponses écrites à l'avance, quand les routes `/v1/playground` ne sont pas en ligne sur le serveur. Signalé par la pastille « Démo » ; rien n'est noté pour de vrai. |
| À traiter | `todo` | La file en tête du Dashboard et de Suivi : ce qui attend un humain (passage à l'humain, mot-clé d'alerte, fan sans réponse depuis plus de 10 min, proposition du copilote, envoi échoué pour de bon), le plus grave en premier. Ligne `nv-todo` du design system. |
| Parcours des fans | `funnel` | L'entonnoir du Dashboard : combien de fans passent chaque étape (nouveau, fan connu, conversation chaude, 1re offre, achat), et l'étape qui casse. |
| Données d'exemple | `sample` | Données fictives d'un écran du CRM tant que sa route n'existe pas, signalées par la pastille « Exemple » (`nv-sample`). Distinct du mode démo du playground. |
| Compte fan de test | `test_fan_account` | Vrai compte fan sur une plateforme, tenu par nous, pour tester envois et ventes sans toucher un vrai fan. |
| Liste blanche d'envoi | `send_allowlist` | Fans vers lesquels le connecteur accepte d'envoyer tant qu'elle n'est pas vide (phase 2). |
| Enregistreur | `recorder` | Fonction de l'extension qui note les échanges réseau du site d'une plateforme, anonymisés. |
| Notification Telegram | `telegram_delivery` | Un message que le CRM livre dans un groupe Telegram (alerte, vente, mot-clé, validation). Ne contient jamais de donnée de fan (ADR 0020). |
| Sujet | `topic` | Ce dont parle une notification Telegram : `urgent`, `important`, `info` (onglet Alertes), `sale`, `keyword`, `validation`. Chaque sujet a son routage. |
| Bot (Telegram) | `telegram_bot` | Un bot créé par @BotFather, ajouté dans Réglages › Telegram par son jeton, chiffré en base. Il n'agit sur rien, il prévient. |
| Groupe (Telegram) | `telegram_chat` | Un groupe où un bot se trouve, découvert automatiquement, jamais saisi à la main. |
| Routage | `telegram_route` | Quel sujet va dans quel groupe, pour une créatrice ou pour toutes. |
| Astreinte | `on_call` | Le groupe Telegram qui reçoit l'urgent la nuit. « Personne n'est prévenu la nuit » quand aucune créatrice n'en a un joignable. |
| Apparence (Nuit, Jour, Appareil) | `appearance` (`night`, `day`, `device`) | Le thème du CRM, choisi dans Réglages › Apparence et gardé par le navigateur. Nuit par défaut ; Appareil suit le mode clair ou sombre de l'ordinateur ou du téléphone. |
| Membre de l'équipe | `team_member` | Le profil d'un chatteur ou d'un manager de l'agence, lié à son compte : rôle d'équipe, pays, fuseau, taux de commission, statut (actif, en congé, malade, en déplacement, suspendu, parti) (ADR 0023). Pour l'agence, c'est un prestataire indépendant, jamais un salarié. |
| Préréglage de commission | `commission_preset` | Un taux de commission nommé (par exemple Recrue, Confirmé, Qualifié) que le propriétaire règle et qu'on choisit en un geste sur la fiche d'un membre. |
| Rôle d'équipe | `team_role` (`chatter`, `manager`) | Ce qu'un membre fait dans l'équipe. Distinct du rôle d'accès (`operator`) : un manager voit toute l'équipe et valide rapports et paies jusqu'à « validée ». |
| Scope d'équipe | `team_scope` (`owner`, `agency`, `self`) | Ce qu'un membre lit des tables de l'équipe, calculé par le serveur (ADR 0024) : tout et seul à poser un taux (`owner`), toute l'équipe (`agency`, manager au statut actif), ses propres lignes (`self`). |
| Moi | `me` | L'espace personnel de chacun dans le CRM, sous un seul nom (ADR 0024) : planning, commissions, dossier prestataire, contrat et mandat selon le rôle. |
| Lien d'invitation | `invitation_link` | Lien à usage unique et de courte durée que le propriétaire partage (par exemple sur WhatsApp) pour qu'un membre choisisse son mot de passe ; même mécanisme pour un mot de passe oublié. |
| Shift | `shift` | Une plage où un membre chatte sur un compte d'une créatrice, début et fin en UTC. |
| Créneau | `shift_slot`, `ShiftSlot` | Une des plages fixes de la journée de l'agence (4 × 6 h par défaut) sur lesquelles se posent les shifts. Jamais `slot` seul, réservé aux slots KYC (`KycSlot`). |
| En poste | `onShift` | Le membre dont le shift couvre cet instant sur cette créatrice ; il reçoit en premier les passages à l'humain pour vendre. |
| Rapport de fin de shift | `shift_report` | Ce que le chatteur déclare avoir généré pendant son shift, saisi dans Nirvana, validé par un manager. |
| Source de revenus | `earnings_source` (`declared`, `detected`) | D'où la paie lit les montants d'un compte pour une période : rapports de fin de shift validés ou ventes détectées par le connecteur, jamais les deux. |
| Qui vend | `sellerMode` (`agent`, `team`, `both`) | Réglage d'une créatrice : quand il est temps de vendre, l'agent vend, ou il passe la main au chatteur en poste (motif `sale`), ou les deux. Avec `team` et personne en poste, l'agent continue la relation sans vendre. `both` par défaut : les chatteurs vendent quand ils sont en poste, l'agent quand personne ne l'est. |
| Issue de la passation | `releaseOutcome` (`sold`, `refused`, `none`) | Ce que le chatteur indique en rendant la main après un passage pour vendre ; le code en tire la suite (aftercare après un achat, pas de bouderie après un refus traité). |
| Période de paie | `pay_period` | Une quinzaine (1-15, 16-fin du mois) dans le fuseau de l'agence. |
| Relevé de commissions | `commission_statement` | Le calcul d'un membre pour une période, avec les règles et le taux de change copiés : `draft`, `validated`, `paid`. Jamais « fiche de paie » : un chatteur est un prestataire. |
| Palier | `bonus_tier` | Seuil de net hors taxes qui débloque une prime ; le plus haut atteint compte. |
| Prime | `bonus` | Montant ajouté à un relevé : palier, objectif collectif ou prime manuelle avec motif. |
| Malus | `penalty` | Retenue fixe ou en pourcentage avec motif, plafonnée à la part du membre plus ses primes. Sur la facture, une ligne négative (réfaction prévue au contrat). |
| Report | `carry_over` | Montant sous le minimum de versement, reporté sur la période suivante. |
| Ajustement | `pay_adjustment` | Correction d'un relevé déjà validé, portée sur la prochaine période ouverte. |
| Dossier prestataire | `contractor_profile` | L'identité légale et fiscale d'un membre pour ses factures : nom complet, adresse, pays, identifiant fiscal, attestation de résidence datée, mandat et contrat acceptés. |
| Autofacturation | `self_billing` | L'agence établit la facture au nom et pour le compte du prestataire (art. 289 I-2 du CGI) ; la facture porte la mention « Autofacturation ». |
| Mandat de facturation | `billing_mandate` | L'accord, accepté par le prestataire avant sa première facture, qui autorise l'autofacturation et fixe le délai de contestation. |
| Avoir | `credit_note` | Document numéroté dans la séquence du prestataire qui annule ou réduit une facture émise, en la citant. Une facture émise ne se modifie jamais. |
| Régime de facturation | `billing_regime` | Les règles de facture d'un pays de prestataire (mentions, TVA, retenue à la source), réglées par le propriétaire et validées par le comptable. |
| Part de l'agence | `agency_share` | La part des revenus d'une créatrice qui revient à l'agence. |
| Routine | `routine` | Les tâches quotidiennes qu'une créatrice coche dans son application : celles de l'agence comptent pour la série, les siennes non. |
| Série | `streak` | Le nombre de jours d'affilée où la créatrice a coché ses tâches essentielles. |

## Noms à ne pas utiliser

- `model` pour désigner une créatrice (confusion avec modèle LLM) → `creator`.
- `user` pour un fan → `fan`. `user` désigne un utilisateur du dashboard.
- `bot` dans le code → `agent` ou le rôle précis.
- `client` pour un fan (vocabulaire Imperium « relation client ») → `fan`.
- « fiche de paie », « salaire », « sanction » pour un chatteur → relevé de commissions, commission, malus. Un chatteur est un prestataire.
