# 2026-10-28 — EQ-06 : les règles pures des factures (lot 1 sur 8) — in-progress
Fait :
- La fiche est découpée en huit lots, chacun sa PR (notes de session de la fiche) ; le lot 1, sans migration, est écrit.
- `domain/billing.ts` : le régime d'un prestataire à une date (`regimeOn`), un changement jamais en arrière (`assertRegimeChange`, `billing_regime_backdated_unprocessable`), la fin et l'état d'une pièce (`documentValidUntil`, `documentState`), et la garde d'émission (`issueDecision`) avec ses motifs (`no_mandate`, `no_regime`, `regime_not_validated`, `identity_incomplete`, `nothing_to_invoice`) et ses avertissements (`document_missing`, `document_expired`, `mandate_outdated`).
- `domain/invoices.ts` : les lignes d'une facture depuis un relevé validé et ses saisies (`invoiceLines`), libellées en français, qui tombent au centime sur le total du relevé moins les reports entrants ; les totaux par traitement de TVA (`invoiceTotals`) ; le numéro (`invoiceNumber`, `isInvoicePrefix`) ; l'échéance (`invoiceDueOn`) ; la mention et les lignes d'un avoir (`creditNoteMention`, `creditNoteLines`, `credit_note_amount_unprocessable`).
- `domain/invoice-acceptance.ts` : le délai de contestation et les étapes de l'acceptation (`nextAcceptance`, `invoice_acceptance_conflict`).
- `domain/accounting.ts` : le journal des achats (`purchaseJournal`) et les bénéficiaires de la DAS2 (`das2Beneficiaries`).
- Le glossaire gagne « Pièce du prestataire », « Acceptation d'une facture », « Journal des achats » et « DAS2 » ; « Malus » et « Ajustement » disent leur ligne de facture. Le README du module suit.

Pas fait : les lots 2 à 8 (base et contrats par Bilan, émission, PDF et ADR 0036, dossier et mandat, acceptation, export, écrans). Le lot 1 entre après les écrans d'EQ-05 (#281), dans la série que Charles a acceptée le 28/10 (« oui ;) », 15 h 27).

Décisions (défauts à faire valider par Charles et le comptable, détaillés dans la fiche) :
- Une identité à laquelle manque une mention (nom, adresse, pays, identifiant fiscal quand le régime l'imprime) bloque l'émission ; les pièces et le mandat dépassé restent des avertissements.
- Chaque malus est une ligne au montant demandé, et une ligne « Plafond des réfactions » rend ce que le plafond a retenu ; un malus en pourcentage prend sa part de l'arrondi unique du moteur.
- Un report entrant n'est jamais refacturé ; un total nul ou négatif n'émet rien.
- Échéance à quinze jours de l'émission (réglage) ; le lot 3 donne à la facture d'un montant reporté l'échéance du relevé qui le versera.
- Numéro `PRÉFIXE-AAAA-NNNN`, séquence remise à 1 chaque année.

Découvertes :
- Le régime « France, prestataire redevable de la TVA » fait payer la TVA en plus de la commission, et le moteur de paie ne la connaît pas : question pour Charles et le comptable avant le lot 3.
- L'index des fiches (`docs/sessions/tasks/README.md`) et les cases des fiches EQ-01 à EQ-04 sont en retard sur le code : EQ-01 à EQ-04 y sont « todo » et la plupart de leurs cases sont vides alors que leurs lots sont dans main. Une passe à part sur ces fiches, sans code, les remettrait d'accord.

Candidats à suppression : aucun.

Vérifié :
- `pnpm check` ✓ (typecheck, lint, prettier, knip, check-repo, drift).
- Tests unitaires du domaine de la paie ✓ (12 fichiers, 116 tests sur main avec #281, dont 4 nouveaux fichiers : régimes et pièces, lignes et totaux, avoirs, acceptation, journal et DAS2).
