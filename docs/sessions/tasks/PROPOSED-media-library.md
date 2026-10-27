# Médiathèque : synchroniser le coffre Reveal, décrire et valider chaque média
Statut : proposed (ID à donner par Charles ; née de l'étude de Desirely du 27/10)
Phase : 6 (avant le catalogue de P6-01, qui en dépend)
Dépend de : ADR 0030 (proposée), capture Reveal (forme de `listVaultMedia` et `fetchMedia`), rôle `sense` (P3-04)
Branche : task/<id>-media-library

## Objectif
Le propriétaire voit dans Nirvana tous les médias du coffre Reveal de chaque créatrice, rangés par dossier comme dans Reveal, chacun avec une description que l'agent peut raconter au fan, corrigée et validée par un humain, et sait pour chaque fan ce qu'il a déjà vu.

## Contexte à lire
ADR 0030, ADR 0018 (§ 1 et § 5), `P6-01-sales-catalog.md` (§ Description par média, § Accès aux médias), `docs/architecture/data-model.md` (§ Médias), `apps/api/src/modules/media/` (`descriptionKey`, `keyframeRate`, `spreadFrames`), `docs/reference/media-vocabulary.md`, `docs/reference/reveal-connector-inventory.md` (L10, L15, § Vault), `docs/reference/desirely-analysis.md`.

## Ce que fait Desirely (centre d'aide, 27/10)
Onglet Médias par modèle ; bouton Synchroniser : choix de la plateforme, navigation dans ses dossiers, « Tout sélectionner », « Charger plus », dossier de destination, barre « Synchronisation des médias : X / Y », relance sans doublon. Pas de téléversement depuis l'ordinateur. Dossiers imbriqués, filtres par dossier, plateforme et type. Descriptions générées à la demande (0,10 € le média ; vidéo de plus de 60 s décrite par 8 images), dans la langue de la créatrice, modifiables dans la fiche du média. Les médias envoyés par les fans sont décrits d'office. Un média logique porte ses liaisons par plateforme. Flou des médias à l'écran (non, oui, oui + survol).

## À faire
- [ ] Contrats et migration (Bilan) : `media_platform_refs`, `media_descriptions.author | validated_by | validated_at | creator_note`, `media_sends.unlocked_at`, selon l'ADR 0030.
- [ ] Connecteur (Bilan) : `listVaultMedia` et `fetchMedia` dans `FakeReveal` d'abord, puis dans l'adaptateur Reveal après la capture ; test de contrat.
- [ ] Job `media.sync` (rejouable, par lots, plafond du jour respecté) : liaisons créées ou mises à jour, `removed_at` pour un média disparu, description par le rôle `sense` pour chaque nouvelle empreinte, original effacé après description, vignette réduite gardée.
- [ ] Règle de lecture de l'agent (Agent) : dernière description validée seulement ; un média sans description validée rend son script non proposable (P6-01).
- [ ] Écran Créatrices › Médias (Extension) : grille par dossier du coffre (Jour ☀️ / Nuit 🌙 lus dans le nom), filtres type et état (« À décrire », « À valider », « Validé »), fiche du média avec la description, sa correction, « Valider » et le ressenti de la créatrice ; progression de la synchronisation et dernier passage ; vignettes floutées par défaut, réglage « Flou des médias » (toujours, au survol, jamais) dans Réglages › Apparence.
- [ ] « Vu par ce fan » (Agent, Bilan) : gratuit vu à l'envoi, payant vu au déblocage confirmé par la plateforme, envois manuels des chatteurs compris (historique Reveal).

## Critères d'acceptation
- Tests du domaine : une resynchronisation n'écrit rien de nouveau ; un média retiré du coffre garde ses descriptions ; une nouvelle génération n'écrase jamais une description validée ; un script dont un média a été vu par ce fan est écarté.
- Test contre `FakeReveal` : synchronisation de deux dossiers, d'un média supprimé, d'une pagination.
- Rendu de l'écran à 1 440 px et 400 px ; aucune vignette nette tant que le flou est actif.
- Aucun vrai média ni vraie description dans le dépôt (ADR 0010) : les tests utilisent des fichiers générés.

## Hors périmètre
Téléverser vers une plateforme, créer des dossiers dans Nirvana, éditer les scripts (fiche « Atelier de scripts »), OnlyFans (même modèle, plus tard).

## Notes de session
