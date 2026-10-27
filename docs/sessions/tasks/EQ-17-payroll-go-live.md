# EQ-17 Mise en service de la paie : rien de réel avant que tout soit prouvé
Statut : todo (ID validé par Charles le 27/10/2026, 15h11 : « je les veux tous »)
Phase : équipe (ADR 0023), dernière étape de la chaîne de paie, au déploiement
Dépend de : EQ-04, EQ-05, EQ-06, EQ-15, le déploiement (Hetzner, Coolify), `docs/runbooks/restore.md`
Branche : task/eq-17-payroll-go-live

## Objectif
La première vraie paie et la première vraie facture ne partent que lorsque les sauvegardes, le comptable, la double authentification et un calcul à blanc sont prouvés, et l'application montre l'état de chacun.

## Contexte à lire
`docs/architecture/operations.md` (§ Données), `docs/runbooks/restore.md` (« une sauvegarde non testée n'existe pas »), ADR 0023 (§ Paie, § Factures), EQ-04, EQ-05, EQ-06 (le comptable valide contrat, mandat, régimes et première facture), EQ-15. Imperium s'est arrêté sans sauvegarde : son historique est perdu. C'est la leçon numéro un.

## À faire
- [ ] **État de la mise en service** dans Réglages › Plateformes et paie, une ligne par condition, chacune avec sa preuve et sa date : export quotidien de la base réussi depuis moins d'un délai réglé ; restauration testée sur le vrai déploiement (procédure B du runbook, date et durée) ; validation du comptable (contrat, mandat, chaque régime, facture à blanc), saisie par le propriétaire avec la date et les versions des textes ; double authentification active pour le propriétaire et chaque manager ; coordonnées de l'agence complètes (raison sociale, adresse, SIREN, numéro de TVA) ; source du taux de change à jour.
- [ ] **Gardes dans le serveur** : tant que la validation du comptable n'est pas enregistrée, aucune facture réelle n'est émise (le relevé reste validable, comme dans EQ-06) ; tant que la double authentification manque à un manager, il ne valide rien (EQ-15). Ces gardes ne se désactivent pas « pour tester ».
- [ ] **Paie à blanc** : une première quinzaine calculée en parallèle, relevés vérifiés à la main sur un tableur par Charles avant de marquer quoi que ce soit « payé » ; l'écart éventuel est expliqué ligne par ligne, puis corrigé dans le moteur avec un cas de test, jamais à la main dans un relevé.
- [ ] **Sauvegarde visible** : l'export tourne hors de l'application ; le script écrit son résultat dans une table `backup_runs` par `withAdmin`, et l'application lit cette table, jamais un fichier du serveur ; au-delà du délai réglé, un avertissement ambre sur le Dashboard du propriétaire. Une restauration de moins de trois mois est exigée, comme le test trimestriel du runbook.
- [ ] **Archive des factures** : chaque année, factures, avoirs, journal des achats et récapitulatif DAS2 exportés hors du serveur et gardés dix ans (Code de commerce L123-22), indépendamment des sauvegardes de 30 jours ; l'export est vérifié (empreintes SHA-256 relues).
- [ ] Une recette écrite dans `docs/runbooks/` : l'ordre des preuves, qui fait quoi, et ce qu'on fait si une preuve manque le jour de la paie.

## Critères d'acceptation
- Tests : sans validation du comptable, la validation d'une période réussit et n'émet aucune facture ; avec, elle en émet ; un export de base plus vieux que le délai affiche l'avertissement ; l'archive annuelle relue donne les mêmes empreintes que les PDF stockés.
- La recette a été jouée une fois sur le vrai déploiement, et son résultat est dans le journal des sessions.
- Finition (Charles, 27/10, 15h22 : « que ce soit vraiment très joli… des hovers partout… une belle hiérarchie des informations ») : chaque écran passe la barre de `docs/design/README.md` § Finition d'un écran, preuves comprises (captures Nuit et Jour, bureau et téléphone, mouvement réduit).

## Hors périmètre
Rapprochement bancaire (Qonto), transmission à une plateforme agréée (EQ-06, hors périmètre), déploiement lui-même.

## Notes de session
