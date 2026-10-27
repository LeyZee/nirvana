# 0030. Médiathèque : un média, ses liaisons par plateforme, le coffre fait foi

Statut : accepted (Charles, 27/10 20h37, carte « J'accepte, vignette seule »)
Date : 2026-10-27

## Contexte

L'agent ne vend que des étapes de scripts dont les bundles sont préparés dans Reveal (ADR 0018, P6-01). Pour raconter un média au fan, il lui faut une description fidèle de chaque média ; pour ne jamais lui remontrer un contenu, il faut savoir ce qu'il a déjà vu. Aujourd'hui :

- `media_assets`, `media_descriptions` et `media_sends` existent, mais un média n'a aucun lien avec son identifiant sur la plateforme : on ne sait pas dire « ce média du coffre Reveal est celui-ci » ;
- le port déclare `listVaultMedia` et `fetchMedia` (ADR 0018), sans adaptateur tant que la capture Reveal manque ;
- la description est une sortie du rôle `sense` qu'aucun humain ne peut corriger ni valider (P6-01 le demande) ;
- P6-01 laisse ouverte la question « récupération et conservation des médias » et demande une ADR avant le code.

Desirely, l'outil concurrent étudié le 27/10 (centre d'aide, 58 articles), règle ces points ainsi : une médiathèque par créatrice remplie seulement par synchronisation depuis la plateforme (jamais par téléversement), un média logique relié à son original sur chaque plateforme, des descriptions générées puis modifiables, une description d'étape obligatoire qui « fait foi » sur la scène, et une règle « un média déjà vu exclut le script ». La comparaison complète est dans `docs/reference/desirely-analysis.md`.

## Décision

1. **Un média logique, des liaisons par plateforme.** `media_assets` reste le média (un fichier, une empreinte `sha256` unique par créatrice). Une nouvelle table `media_platform_refs` le relie à son original sur chaque compte : `(platform_account_id, platform_media_id)` unique, `media_asset_id`, `folder_ref`, `folder_name`, `last_synced_at`, `removed_at`. La même photo dans le coffre Reveal et, plus tard, dans celui d'OnlyFans est un seul média avec deux liaisons. Le cœur ne connaît que la liaison, jamais la forme Reveal (ADR 0003).

2. **Le coffre de la plateforme fait foi.** Nirvana ne téléverse rien vers une plateforme et n'a pas de dossier à lui : la médiathèque est le reflet du coffre, dossiers compris (les suffixes Jour ☀️ et Nuit 🌙 se lisent dans le nom du dossier, P6-01). La synchronisation (`media.sync`, job rejouable) lit `listVaultMedia`, crée ou met à jour les liaisons par `platform_media_id`, et marque `removed_at` quand un média disparaît du coffre, sans jamais supprimer le média ni ses descriptions. C'est une lecture : la garde d'écriture de l'ADR 0018 n'est pas concernée.

3. **Description en deux temps, la parole humaine gagne.** À la synchronisation, le rôle `sense` décrit chaque nouveau média (images, vidéos par images clés et transcription, `media.ts`), en français, une fois par empreinte et par version du descripteur (`descriptionKey`). Un humain (propriétaire ou créatrice) peut corriger la description et la valider : la correction est une nouvelle ligne (`media_descriptions` reste en ajout seul) avec `author` humain, `validated_by`, `validated_at`, et un champ libre `creator_note` (le ressenti de la créatrice, P6-01). L'agent lit la dernière description validée, sinon rien : un média sans description validée rend son script non proposable (P6-01). Changer de modèle de vision redécrit les médias non validés, jamais un média qu'un humain a validé.

4. **Fichiers : on garde le minimum.** Le fichier original est lu par `fetchMedia` le temps de la description, puis effacé. On garde l'empreinte, la durée, le type et une vignette réduite pour l'écran (affichée floutée par défaut). Pour redécrire, on relit le fichier sur la plateforme. Si Reveal ne permet pas de télécharger les originaux, le repli est le dépôt manuel du fichier par le propriétaire, rattaché à une liaison existante du coffre par l'écran ; le fichier déposé suit la même règle d'effacement.

5. **« Vu par ce fan » se lit par média.** Un média gratuit est vu dès son envoi, un média payant seulement une fois débloqué ; un envoi fait à la main par un chatteur dans Reveal compte autant qu'un envoi de l'agent, d'où la lecture de l'historique de la plateforme (ADR 0018, § 5). `media_sends` garde l'envoi, et reçoit `unlocked_at` pour le déblocage confirmé par la plateforme (jamais sur la parole du fan). La politique écarte tout script dont un média a déjà été vu par ce fan.

## Conséquences

Positives :
- La même règle sert Reveal aujourd'hui et OnlyFans demain : un script est proposable sur un compte seulement si chacun de ses médias y a une liaison.
- L'agent ne décrit jamais un média de son imagination, et une correction humaine n'est jamais écrasée par une nouvelle génération.
- Rien d'intime ne reste chez nous au-delà d'une vignette.

Négatives :
- Une redescription demande un nouvel accès à la plateforme, donc une session valide.
- Les descriptions coûtent des appels de vision à la synchronisation : elles entrent dans le plafond du jour, et une première synchronisation d'un gros coffre se fait par lots.
- `media_platform_refs` et `unlocked_at` demandent une migration (numéro attribué par Bilan).

À surveiller :
- Les signatures de `listVaultMedia` (pagination, dossiers) et de `fetchMedia` (URL temporaire ou flux) se fixent d'après la capture.
- La durée de conservation de la vignette, si Charles en veut une autre que celle des médias de la créatrice (`rights`).

## Alternatives rejetées

- **Téléverser les médias dans Nirvana puis vers Reveal.** Nirvana deviendrait une seconde source de vérité du coffre, et chaque envoi passerait par une écriture de plus derrière la garde ; Desirely y a renoncé pour la même raison.
- **Une ligne de média par plateforme.** Le même contenu aurait deux descriptions et deux historiques « vu », et un fan qui a vu la photo sur Reveal pourrait la recevoir sur OnlyFans.
- **Garder les originaux chiffrés en stockage objet.** Utile pour redécrire sans session, mais c'est un stock de contenus intimes à protéger pour un gain faible : la plateforme les garde déjà.
