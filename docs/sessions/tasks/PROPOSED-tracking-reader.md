# Suivi : file « à traiter » et lecteur de conversation avec le volet fan
Statut : proposed, en partie livrée (file, lecteur et décisions : fil Extension, 22/10) ; reste le volet fan et la notification
Phase : 4 (supervision), ne se code qu'après la clé xAI et la capture Reveal
Dépend de : #42 (liste de Suivi), P0-05 (messages et événements d'une conversation), P0-06 (connecteur, lecture de la note Reveal), P3-02 (mémoire fan)
Branche : task/<id>-tracking-reader

## Objectif (1 phrase)

Le propriétaire voit d'abord ce qui demande un humain, ouvre une conversation, décide des brouillons qui l'attendent et comprend en un coup d'œil où l'agent en est avec ce fan, sans fiche fan dans le CRM.

## Contexte à lire

- Décision de Charles (19/10, carte du chat du projet, choix « Valider dans Suivi », enregistrée par le coordinateur) : le lecteur de Suivi porte valider (avec retouche), refuser, reprendre et rendre la main, en attendant le panneau latéral de l'extension, qui réutilisera les mêmes briques. Personne n'écrit à un fan depuis le CRM : reprendre la main, c'est continuer dans Reveal. Remplace la lecture seule décidée le 17/10.
- Décisions de Charles (17/10), toujours valables hors lecture seule : jamais une Inbox ; pas de liste de fans ni d'import dans le CRM, Reveal reste la seule fiche (chat du projet, 21h44 et recommandation du coordinateur 21h47) ; « moins d'écrans, plus de moteur ».
- Revue 08 (`/mnt/project-files/revue/08-revue-onglets-crm.md`, hors dépôt) : Suivi est l'onglet le moins pensé.
- `docs/design/README.md` : « Hiérarchie », « Clarté », pastilles d'état.
- Routes existantes : `/v1/conversations/:id`, `/messages`, `/events`.

## Décisions à prendre avant le code

- **File « à traiter »** : une conversation y entre sur `handoff_requested` (escalade de l'agent, avec sa raison), sur un mot-clé surveillé, ou en `error` ; elle en sort quand un humain l'a reprise puis rendue. Le reste de la liste (#42) reste en dessous, replié.
- **Notification** : le propriétaire est prévenu d'une entrée dans la file (navigateur d'abord ; téléphone avec la PWA plus tard).
- **Volet fan** : ce que l'agent a lu, rien de copié chez nous. La note Reveal du fan est lue en direct par le connecteur au moment de l'ouverture (pas stockée) ; l'état propre à l'agent vient de notre base.

## Ce que l'API expose (accordé avec le fil Bilan le 17/10)

1. `needsHuman` et `handoffReason` sur `ConversationSummary`, et le filtre `GET /v1/conversations?creatorId=&queue=to_handle`.
2. `GET /v1/conversations/:id/fan-panel?creatorId=` : `{ revealNote: string | null, cursor: { stage, sexualizationAllowedAt | null }, offers: [{ scriptLabel, at, outcome: bought | refused | pending }], budgetFlag: boolean, lastHandoff: { reason, at } | null }`. La note Reveal est lue en direct par le connecteur (méthode de l'ADR 0018, sous drapeau), jamais stockée ni journalisée. `cursor` et `offers` arrivent quand le moteur les produit : d'ici là le volet ne les montre pas.

## À faire (liste vérifiable)

1. ✓ File « à traiter » en tête de Suivi, avec la raison de l'escalade en mots : elle lit `todos` de `GET /v1/dashboard`, que le serveur calcule (pas de `needsHuman` ni de filtre `queue` sur la liste).
2. ✓ Lecteur : le fil (`/messages`), les brouillons et leur sort (`/events`), `/suivi?conversation=<id>` ouvre la conversation (lien des alertes Telegram). Valider, retoucher puis envoyer, refuser avec une raison, reprendre et rendre la main sur les routes existantes ; un refus du serveur (garde bloquante 422, arrêt ou session expirée 409) laisse le brouillon et dit pourquoi.
3. Volet fan à droite du fil (replié sur téléphone) : note Reveal, curseur, offres faites et refusées, drapeau budget nul, dernière escalade.
4. Tests : unitaires sur la logique de la file et du volet ; aucune donnée réelle de fan dans les fixtures.

## Critères d'acceptation

- Une escalade `handoff_requested` de `FakeReveal` apparaît en tête de Suivi avec sa raison, et le volet montre la note lue en direct.
- Aucune note Reveal en base ni dans les journaux.
- `pnpm check` et `pnpm test:all` verts.

## Hors périmètre

- Le panneau latéral de l'extension (poste du chatteur, fiche à part), qui reprendra les briques du lecteur.
- Liste de fans, import ou édition de la note Reveal depuis le CRM.

## Notes de session

- 22/10, fil Extension : file « à traiter », lecteur et décisions livrés (`apps/web/src/screens/tracking/`). Reste : volet fan (attend `fan-panel` et le connecteur), notification navigateur d'une entrée dans la file.
