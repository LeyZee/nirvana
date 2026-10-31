# 0037. Factures : un PDF/A rendu une fois par PDFKit, gardé dans le bucket verrouillé des factures

Statut : proposed
Date : 2026-10-31
Précise : l'ADR 0023 (§ Factures, « son PDF est rendu une fois depuis ces données, gardé avec son empreinte, et plus jamais régénéré » ; « deux dépendances nouvelles se décident dans leurs fiches : la génération de PDF… ») et l'ADR 0028 (§ 4, le bucket des factures gardé dix ans)

## Contexte

Depuis #328, la validation d'un relevé émet sa facture et ses avoirs en base : numéro, lignes, mentions et parties sont figés. Il manque le document lui-même, celui que le chatteur reçoit, que le comptable range et qu'un contrôle fiscal demande (EQ-06, lot 4). La fiche fixe quatre exigences :

- **rendu une fois** par un job, depuis les données figées, jamais régénéré ;
- **servi tel quel**, identique octet pour octet à chaque téléchargement, même après un changement des réglages de l'agence ou du dossier du prestataire ;
- **gardé dix ans** (art. L123-22 du Code de commerce), hors du disque du serveur ;
- chaque mention du régime **présente sur le PDF**, vérifiée par un test.

La base est prête : `invoice_pdfs` (migration 0041) garde par facture une clé de stockage et l'empreinte SHA-256, écrites une fois par le job. Restent deux choix : avec quoi rendre le PDF, et où garder ses octets.

Deux faits pèsent sur ces choix :

- **la facturation électronique**. Selon le calendrier en vigueur, une petite entreprise française devra émettre ses factures entre entreprises établies en France sous forme électronique à partir du 1er septembre 2027, par une plateforme agréée. Un chatteur établi en France, autofacturé par l'agence, entre dans ce cas ; un chatteur du Bénin ou de Madagascar relève de l'e-reporting. Un des formats admis, Factur-X, est un PDF/A-3 qui porte en pièce jointe les données de la facture en XML. Ce lot n'envoie rien à une plateforme (fiche EQ-06), mais le format choisi aujourd'hui ne doit pas fermer cette porte ;
- **les octets ne se recalculent pas**. Une facture se corrige par avoir, jamais en refaisant son PDF. Si un PDF est perdu, aucun rendu ultérieur n'est la même pièce : la police, la bibliothèque et la mise en page auront pu changer.

## Décision

**1. Le PDF est un PDF/A-3b rendu par PDFKit, dans le worker.** PDFKit (licence MIT, JavaScript pur, aucune dépendance native, version 0.20.2 publiée fin août 2026) écrit du PDF/A-3, balisé, avec la langue du document et des pièces jointes déclarées comme la norme le demande. C'est exactement l'enveloppe de Factur-X : le jour où la plateforme agréée est choisie, on ajoute le XML au même PDF, sans changer de bibliothèque ni de format d'archive. Le XML n'est pas produit dans ce lot.

Essai fait avant d'écrire cette ADR (hors dépôt, supprimé ensuite) : un PDF/A-3b avec une police embarquée et une pièce jointe XML, rendu deux fois, dans deux processus, donne les mêmes octets, à condition de fixer la date de création. Elle vaudra `issued_at` de la facture.

**2. Le rendu est reproductible et vérifié.** La date de création du PDF est celle de l'émission. Aucune valeur aléatoire n'est écrite, et la police est embarquée depuis le dépôt. Un job relancé après une panne produit donc les mêmes octets. Le lot vérifie trois choses :

- deux rendus des mêmes données sont identiques ;
- chaque mention du régime se lit dans le texte extrait du PDF (bibliothèque d'extraction en dépendance de test seulement) ;
- la police couvre chaque caractère imprimé, espaces fines insécables des montants comprises ; sinon la facture n'est pas rendue et l'erreur est dite.

La conformité PDF/A-3 est contrôlée avec veraPDF, le validateur de référence, sur un PDF produit avec des données inventées.

**3. Une seule police, Geist**, celle du design system, sous licence SIL Open Font License, qui permet de l'embarquer. Ses fichiers et sa licence entrent dans le dépôt, à côté du code qui rend la facture. Si le test de couverture montre qu'il manque à Geist un caractère imprimé, le lot le dit et propose une autre police libre avant d'écrire le rendu. La mise en page est sobre : en-tête des parties, tableau des lignes, totaux, mentions, puis le relevé de commissions en annexe dans le même fichier.

**4. Les octets vont dans le bucket des factures de l'ADR 0028, jamais dans Postgres ni sur le disque.** C'est le bucket gardé dix ans, chez Hetzner (Europe, compatible S3), séparé du bucket des sauvegardes de 30 jours, avec versioning et verrou d'objets en mode gouvernance :

- **clé** : `invoices/<année d'émission>/<id de la facture>.pdf`. Ni nom ni numéro de prestataire dans la clé ;
- **verrou par objet** : posé à l'envoi jusqu'à dix ans après la clôture de l'exercice de la facture (par exemple, une facture de 2027 est verrouillée jusqu'au 31 décembre 2037 si l'exercice est l'année civile). Un verrou fixe de dix ans à partir de l'envoi laisserait sans protection les derniers mois de l'obligation ;
- **identifiants de l'application** : distincts de ceux du service `backup`, ils écrivent et lisent sous `invoices/`. Aucun ne détient le droit de passer outre le verrou : même avec ces identifiants, une version verrouillée ne s'efface pas avant sa date ;
- **envoi signé** avec la somme de contrôle SHA-256 (comme l'ADR 0029) : le bucket refuse un fichier abîmé en route ;
- **exports annuels** d'EQ-17 (factures, avoirs, journal des achats, DAS2) : dans le même bucket, sous `archives/`, écrits par le service `backup` avec ses propres identifiants ; l'export relit les empreintes de `invoice_pdfs`.

**5. Le job écrit dans cet ordre, et ne remplace jamais rien.** `payroll.render_invoice_pdf` est mis en file à l'émission, un par document (clé d'idempotence par facture). Il lit les données figées, rend le PDF, l'envoie, puis écrit la ligne `invoice_pdfs` (clé, empreinte). S'il est relancé :

- si la ligne existe, il n'y a rien à faire ;
- si l'objet existe sans la ligne (panne entre les deux), il relit l'objet : même empreinte, il écrit la ligne ; empreinte différente, il n'écrit rien et alerte le propriétaire (`invoice_pdf_conflict`). L'objet n'est jamais remplacé.

Une facture sans PDF reste une facture valide en base. L'écran dit « PDF en préparation » et l'alerte part si le PDF manque encore après une heure.

**6. Le téléchargement passe par l'API, qui vérifie l'empreinte.** `GET /v1/payroll/invoices/:id/pdf` lit la ligne `invoice_pdfs` sous la politique de la facture : un membre lit les siennes, le propriétaire et un manager actif toutes. L'API télécharge l'objet, recalcule son SHA-256 et ne le sert que s'il est égal à celui de la base. Sinon, réponse d'erreur et alerte : un fichier altéré n'est jamais servi. Le bucket reste privé, sans lien signé public. Le nom du fichier téléchargé est le numéro de la facture.

**7. Les identifiants du bucket sont des secrets de déploiement**, comme ceux de l'ADR 0028 : posés dans Coolify par la session de mise en service (runbook `deploy.md`), jamais dans le dépôt, jamais tapés par Charles. En développement et dans les tests, un stockage en mémoire remplace le bucket. La CI vérifie aussi l'envoi signé contre un MinIO lancé pour le test.

## Questions au comptable

À confirmer avant la mise en service (EQ-17) :

- la date de clôture de l'exercice de l'agence, qui fixe la fin du verrou de chaque PDF (année civile par défaut) ;
- que le PDF/A, sans XML, suffit jusqu'au passage à la facturation électronique, et le calendrier qui s'applique à l'agence pour ses prestataires établis en France.

## Conséquences

Positives :

- un PDF par facture, identique à chaque téléchargement, que personne ne peut effacer ni remplacer pendant toute l'obligation de conservation, l'application comprise ;
- une pièce prête pour Factur-X : le passage à la facturation électronique ajoute une pièce jointe, il ne refait pas les archives ;
- un worker léger : aucune dépendance native, aucun navigateur dans l'image, environ 25 Mo de bibliothèques ;
- la base reste petite : le dump quotidien ne grossit pas des PDF, et les factures tiennent leurs dix ans hors de Neon.

Négatives :

- un PDF existe en deux temps (l'objet, puis la ligne) : le job gère la reprise, et l'alerte dit un PDF qui manque ;
- la mise en page s'écrit en code (coordonnées, tableau), sans HTML ni CSS ; elle est sobre et change rarement, et chaque changement ne touche que les factures émises après lui ;
- une dépendance de plus dans le worker (PDFKit) et une de test (extraction de texte) ;
- un bucket de plus à surveiller : l'état de mise en service d'EQ-17 dira s'il est joignable et si des PDF manquent.

À faire, dans la PR du lot 4 (après acceptation) :

- `payroll.render_invoice_pdf` et son rendu ; la police Geist et sa licence dans le dépôt ;
- le stockage du bucket (envoi signé, verrou par objet) et son remplaçant en mémoire ;
- `GET /v1/payroll/invoices/:id/pdf` ;
- les événements `invoice_pdf_conflict` et le PDF manquant ;
- les tests (reproductibilité, mentions par régime, couverture de la police, reprise après panne, empreinte refusée) et le contrôle veraPDF ;
- les variables du bucket dans `.env.example` sans valeur, et le runbook de déploiement.

## Alternatives rejetées

- **Un navigateur sans tête (Chromium par Playwright) qui imprime du HTML** : mise en page en HTML et CSS, mais une image de plusieurs centaines de Mo pour le worker, un navigateur à tenir à jour sur le serveur, des octets qui changent d'une version à l'autre, et pas de PDF/A.
- **@react-pdf/renderer** : des composants React, mais construit sur PDFKit avec une couche de mise en page en plus, et lié à la version de React du dashboard. Pour une page de facture, la couche ne paie pas son poids.
- **Typst** : la plus belle typographie, mais un binaire ou un module WebAssembly de plus dans l'image, et un second langage de gabarit à maintenir.
- **pdf-lib** : aucune mise en page du texte (ni retour à la ligne, ni tableau), tout serait à écrire.
- **Les octets dans Postgres (`bytea`)** : la ligne et le fichier dans la même transaction, c'est son vrai avantage. Mais rien n'y empêche le rôle admin d'effacer un PDF, la perte du compte Neon emporterait les pièces (le dump de 30 jours ne couvre pas dix ans), et chaque export quotidien porterait tous les PDF.
- **Le disque du serveur** : exclu par la fiche et par l'ADR 0023 ; un VPS reconstruit perd tout.
- **Rendre le PDF à chaque téléchargement** : aucune garantie octet pour octet après un changement de police, de bibliothèque ou de mise en page ; une facture n'est pas une vue.
- **Un lien signé vers le bucket** : l'API ne pourrait plus vérifier l'empreinte avant de servir, et le lien circule hors de la politique de la facture.
