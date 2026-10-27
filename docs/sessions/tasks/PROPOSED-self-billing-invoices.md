# Factures des prestataires : autofacturation, avoirs, export comptable (ID à proposer)
Statut : proposed (lot 3 de l'ADR 0023, ID à valider par Charles)
Phase : équipe (ADR 0023)
Dépend de : fiches Moteur de paie et Paie : écrans
Branche : task/<id>-self-billing-invoices

## Objectif
À la validation d'une période, produire pour chaque prestataire une facture qu'un expert-comptable accepte sans retouche : établie par l'agence au nom du prestataire, numérotée dans sa propre séquence, acceptée par lui, figée, corrigée seulement par avoir, et retrouvable du rapport de shift jusqu'au transfert qui la solde.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Factures en entier, § Données et RLS), ADR 0011, `docs/conventions/security.md`. Sources : CGI art. 289 (I-2 autofacturation, I-3 date d'émission, VII piste d'audit), art. 283-2 (autoliquidation), art. 182 B (retenue à la source) ; annexe II art. 242 nonies A (mentions) ; BOFiP BOI-TVA-DECLA-30-20-10-30 (mandat, acceptation) et BOI-TVA-DECLA-30-20-20-10 § 120-130 (séquence propre à chaque prestataire) ; Code de commerce L441-9 (échéance, pénalités, indemnité de 40 €) et L123-22 (dix ans). Concept d'origine : les factures de chatteur d'Imperium, à reprendre avec les corrections ci-dessous.

## À faire
- [ ] **Dossier prestataire** (`contractor_profile`) : nom complet (personne ou entreprise), adresse postale complète, pays, identifiant fiscal local s'il existe, adresse e-mail, attestation de résidence fiscale (fichier, date de délivrance), versions acceptées du contrat de prestation et du mandat de facturation. Le chatteur le remplit dans son espace, le propriétaire le vérifie. Coordonnées de paiement hors de ce lot.
- [ ] **Contrat et mandat** : textes versionnés (le contenu est fourni par l'agence et validé par son comptable, jamais écrit par la session), acceptés dans l'application avant la première facture ; on garde la version, la date, l'empreinte SHA-256 du texte et l'auteur. Le mandat fixe le délai de contestation (réglage, 7 jours par défaut).
- [ ] **Régime de facturation par pays** (`billing_regime`) : un réglage du propriétaire validé par le comptable, copié dans chaque facture : mentions, traitement de la TVA, retenue à la source écartée ou non par convention. Livrer un seul régime : « prestataire établi hors de l'UE, convention fiscale qui réserve l'imposition à son pays ». Un membre d'un pays sans régime : relevé validé, facture refusée avec un avertissement clair.
- [ ] **Émission** dans la transaction de validation (point d'accroche du moteur) : refus si pas de mandat accepté ou pas de régime ; numéro pris sur une ligne compteur (prestataire, année) verrouillée `FOR UPDATE`, préfixe propre au prestataire, jamais une `sequence` Postgres ; copie dans la facture des coordonnées des deux parties, du régime, des mentions, de la date d'émission, des lignes et du total ; idempotence par relevé (une facture par relevé, quoi qu'il arrive). Les coordonnées et mentions de l'agence sont des réglages ; aucune n'est écrite dans le code.
- [ ] **Mentions** (régime hors UE) : « Autofacturation » ; « Facture établie par [agence] au nom et pour le compte de [prestataire] » ; « Autoliquidation » (TVA due par le preneur, art. 283-2 du CGI), sans montant de TVA facturé ; nom complet et adresse des deux parties ; identifiant fiscal du prestataire s'il existe ; SIREN et numéro de TVA de l'agence ; numéro ; date d'émission ; période de la prestation ; désignation précise de la prestation ; nature « prestation de services » ; montants hors taxe par ligne et total ; devise ; date d'échéance ; pénalités de retard et indemnité forfaitaire de 40 € ; référence du relevé de commissions joint.
- [ ] **Lignes** : commissions par compte (la plateforme, jamais un fan), primes et paliers, malus en lignes négatives libellées comme réfactions prévues au contrat, régularisations avec leur période d'origine. Un montant reporté est facturé dans sa période ; l'échéance de la facture suit le versement attendu.
- [ ] **PDF** rendu une fois par un job idempotent depuis les données figées, stocké avec son empreinte SHA-256, servi tel quel ensuite. Le relevé de commissions est joint en annexe. Dépendance PDF à décider ici.
- [ ] **Acceptation** : la facture apparaît dans Mes commissions ; « J'accepte » ou « Je conteste » avec un motif ; acceptation tacite à la fin du délai par un job daté ; chaque étape dans `audit_log`. Une contestation arrive dans Équipe > Paie ; sa résolution est un avoir, éventuellement suivi d'une nouvelle facture, ou un refus motivé.
- [ ] **Avoir** (`credit_note`) : numéroté dans la séquence du prestataire, cite la facture d'origine, même acceptation, même PDF figé. Une facture émise n'est jamais modifiée ni supprimée (trigger et `REVOKE UPDATE, DELETE`).
- [ ] **Paiement** : « payé » (fiche Paie : écrans) rattache le transfert à la ou aux factures qu'il solde.
- [ ] **Avertissements** à la validation, en ambre : attestation de résidence manquante ou de plus d'un an, dossier incomplet, mandat d'une version dépassée.
- [ ] **Export comptable** de la période pour le propriétaire : journal des achats en CSV (date, numéro, prestataire, compte fournisseur, compte de charge, base hors taxe, TVA autoliquidée collectée et déductible au taux du régime, échéance, date et référence du paiement) avec des comptes paramétrables, et une archive des PDF de factures et d'avoirs. Les données structurées de chaque facture suffisent à l'e-reporting de la réforme (date, numéro, identifiant du prestataire, nature, montants, taux) ; aucun envoi à une plateforme agréée dans ce lot.
- [ ] Base (via le propriétaire de `packages/db`) : `contractor_profiles`, `contract_acceptances`, `billing_regimes`, `invoice_counters`, `invoices`, `invoice_lines`, `credit_notes`, `invoice_events` (émission, acceptation, contestation, avoir, paiement), politique par utilisateur (un membre lit ses factures, scope `agency` lit tout), PDF et pièces dans le stockage objet (`docs/architecture/own-platform.md` § Fichiers), jamais sur le disque du serveur, gardés dix ans.

## Critères d'acceptation
- Deux validations simultanées pour deux prestataires différents et pour le même prestataire : chaque séquence reste continue, sans trou ni doublon (test d'intégration).
- Le PDF d'une facture est identique, octet pour octet, à chaque téléchargement, même après un changement des réglages de l'agence ou du dossier du prestataire.
- Un test vérifie la présence de chaque mention du régime livré sur un PDF produit avec des données inventées.
- Sans mandat accepté ou sans régime pour le pays, aucune facture n'est émise et le relevé reste validable.
- Une contestation résolue par avoir laisse la facture d'origine intacte et l'avoir dans la même séquence.
- Un chatteur ne lit que ses factures ; aucun vrai nom, adresse ni identifiant fiscal dans les tests (ADR 0010).

## Hors périmètre
Transmission à une plateforme agréée (e-reporting, à partir du 1er septembre 2027 pour une PME), autres régimes de pays, coordonnées de paiement, facturation des créatrices, rapprochement bancaire, import des factures d'Imperium (fiche Import).

## Notes de session
