# Reveal : ce que le connecteur doit savoir faire

Dernière revue : 2026-10-17. Statut : **proposé**, à confirmer par la capture (`docs/runbooks/reveal-recording.md`) et l'analyse P1-02. Décision de stratégie : ADR 0008 (session capturée, client API serveur).

Ce document liste les capacités dont l'agent a besoin sur Reveal, pourquoi le métier en a besoin, et ce que la capture doit montrer pour chacune. Les endpoints réels iront dans `docs/reference/reveal-api-observed.md` ; le double de test dans `docs/reference/fake-reveal.md`.

## Pourquoi chaque capacité

Le métier (Charles, 17/10) : le fan vient chercher une relation. L'agent fait d'abord le KYC, consigné dans la **note client** du fan, qui sert de mémoire sur des mois. Il sexualise quand une ouverture apparaît, puis vend des PPV en sexto en **déroulant un script natif de Reveal**, avec de la vie entre les étapes, sans jamais renvoyer un script déjà envoyé au même fan. Chaque ligne ci-dessous sert ce parcours.

## Lecture

| # | Capacité | Méthode du port | Pourquoi | Ce que la capture doit montrer |
|---|---|---|---|---|
| L1 | État de la session | `health()` | Coupe-circuit, re-sync (`runbooks/session-expired.md`) | Appel de démarrage (profil courant, config), réponse quand la session est invalide |
| L2 | Boîte de réception : conversations, non-lus, dernier message | `listConversations()` | Savoir à qui répondre sans ouvrir chaque conversation | Liste paginée, filtres (non lus, payeurs), champs non-lus et aperçu |
| L3 | Messages d'une conversation, tout l'historique | `fetchMessages()` | Contexte de réponse ; import initial de l'historique | Pagination vers le passé jusqu'au premier message ; types de messages (texte, média, PPV verrouillé ou acheté, tip, message système, message de masse) |
| L4 | Temps réel | `subscribe?()` | Répondre vite sans marteler l'API | WebSocket ou polling, fréquence du client officiel, événement « nouveau message » et « achat » |
| L5 | Profil d'un fan | `getFanProfile?()` (nouveau) | KYC, priorité, détection des fans fragiles | Pseudo, date d'abonnement, statut, total dépensé, listes ou étiquettes, âge vérifié s'il existe |
| L6 | Historique d'achat d'un fan, ventes du compte | `listTransactions?()` | Échelle de prix, ne pas vendre deux fois, mesurer le CA du bot | Page ventes ou relevés ; comment un achat de PPV apparaît (message, transaction, événement) |
| L7 | Note client d'un fan | `getFanNote?()` (nouveau) | Mémoire longue partagée avec les chatteurs ; import des notes existantes | Lecture de la note, format (texte libre, champs), date de modification |
| L8 | Scripts natifs : liste et contenu | `listPlatformScripts?()` (nouveau) | L'agent pioche dans les scripts de l'agence | Liste, dossiers, contenu d'un script : étapes, textes, médias, prix, délais |
| L9 | Scripts déjà envoyés à un fan | `getScriptHistory?()` (nouveau) | Règle « jamais deux fois le même script au même fan » | Indicateur « déjà envoyé » dans le sélecteur, ou lien entre message envoyé et script ; sinon on le déduit de notre journal |
| L10 | Coffre (médias de la créatrice) | `listVaultMedia?()` (nouveau) | Envoyer un PPV hors script ; décrire le catalogue | Liste paginée, dossiers, type, identifiant réutilisable à l'envoi |
| L11 | Notes du modèle (panneau de droite d'une conversation) | `getCreatorNotes?()` (nouveau) | C'est la fiche persona de Messalina vue par Reveal (Charles, 17/10) : la garder alignée sur la persona versionnée | Lecture, format, si elles sont par compte ou par conversation |
| L12 | Statistiques du fan (panneau de droite) | `getFanProfile?()` | Priorité, rythme de vente, fans à ménager | Chaque statistique affichée et l'appel qui la fournit |
| L13 | Onglet PPV d'une conversation : PPV envoyés, achetés, prix, statistiques de vente | `getFanPpvStats?()` (nouveau) | Charles : « l'agent doit en avoir conscience absolument » ; prix à proposer, taux d'achat, ce qui a déjà été vendu | Appels de l'onglet PPV, champs, période couverte |

## Écriture

Toute écriture porte une clé d'idempotence et passe par `verifySent` (ADR 0008, `connectors.md`). Aucune écriture vers un vrai fan sans demande explicite de Charles (règle 12) ; la capture fait les écritures vers un **fan test** seulement.

| # | Capacité | Méthode du port | Pourquoi | Ce que la capture doit montrer |
|---|---|---|---|---|
| E1 | Envoyer un texte | `sendText()` | Conversation, KYC, vie entre les étapes | Requête d'envoi, identifiant renvoyé, présence d'un identifiant client (nonce) réutilisable comme clé d'idempotence |
| E2 | Envoyer un PPV (médias du coffre + prix + texte) | `sendMedia()` | Vente hors script | Corps de la requête (références de médias, prix, devise), bornes de prix |
| E3 | Envoyer une étape de script natif | `sendScriptStep?()` (nouveau) | Vente par script ; Reveal garde la trace de l'envoi | Endpoint dédié ou envoi ordinaire ; ce qui marque l'étape comme envoyée |
| E4b | Écrire les notes du modèle | `setCreatorNotes?()` (nouveau) | Pousser la persona à jour dans Reveal, à la demande de Charles seulement | Remplacement ou ajout, portée |
| E4 | Écrire la note client | `setFanNote?()` (nouveau) | Consigner le KYC | Remplacement complet ou ajout ; conflit si un chatteur écrit en même temps |
| E5 | Vérifier un envoi | `verifySent()` | Rejeu sans doublon après une erreur réseau | Retrouver le message par nonce, ou par texte et horodatage |
| E6 | Marquer lu, indiquer « en train d'écrire » | `markRead?()`, `setTyping?()` | Rythme humain | Appels faits par le client officiel à l'ouverture et à la frappe |

## Jamais

Le connecteur n'appelle aucun endpoint qui supprime, rembourse, bloque un fan, envoie un message de masse, change un prix d'abonnement ou un réglage du compte. S'ils apparaissent dans la capture, ils sont notés dans `reveal-api-observed.md` sous « Non utilisés ».

## Effets sur le port

L5, L7 à L13, E3, E4 et E4b n'existent pas dans le port décrit par `docs/architecture/connectors.md`. Ce sont des méthodes **optionnelles**, annoncées par `capabilities` (`fanProfile`, `fanNotes`, `creatorNotes`, `ppvStats`, `platformScripts`, `vault`) : OnlyFans n'a pas de scripts natifs, notre plateforme les aura en interne, et le cœur s'adapte à ce que le connecteur déclare (ADR 0003). La forme exacte se fixe après la capture, dans la fiche proposée `docs/sessions/tasks/PROPOSED-reveal-connector.md`. Si le changement de contrat touche plusieurs modules, la session écrit une ADR `proposed`.

## Questions ajoutées aux 10 de `connectors.md`

11. **Scripts natifs** : liste, contenu (étapes, médias, prix, textes), trace de ce qui a été envoyé à un fan, endpoint d'envoi dédié ou non.
12. **Historique** : pagination de tout l'historique d'une conversation, des achats passés et des notes client (import initial, anti-doublon).
13. **Notes client** : lecture, écriture, format, concurrence avec un chatteur.
14. **Âge des fans** : Reveal vérifie-t-il l'âge, et l'expose-t-il.
