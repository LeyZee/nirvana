# 2026-10-31 — ADR 0037 : le PDF des factures et sa conservation (fil Équipe) — in_progress
Fait :
- `docs/adr/0037-invoice-pdf-rendering-and-storage.md` (proposée) et sa ligne dans l'index : un PDF/A-3b rendu une fois par PDFKit dans le worker, reproductible (date de création = émission, police Geist embarquée), prêt à porter le XML de Factur-X le jour de la facturation électronique ; les octets dans le bucket des factures de l'ADR 0028, sous un verrou par objet jusqu'à dix ans après la clôture de l'exercice, jamais remplacés ; un job qui reprend après une panne sans rien écraser ; un téléchargement par l'API qui vérifie l'empreinte avant de servir.
- Fiche EQ-06 : statut (#330) et lot 4 (ADR 0037 proposée, aucun code avant son acceptation).
Pas fait : le code du lot 4, après l'acceptation par Charles.
Décisions : essai de rendu hors dépôt avant d'écrire l'ADR (PDFKit 0.20.2, police libre embarquée, pièce jointe XML : PDF/A-3b, mêmes octets sur deux processus avec une date de création fixée) ; dossier d'essai supprimé.
Découvertes : un verrou fixe de dix ans à partir de l'envoi ne couvre pas la fin de l'obligation (dix ans après la clôture de l'exercice) : le verrou se pose par objet ; question au comptable sur la date de clôture et sur le calendrier de la facturation électronique pour les prestataires établis en France.
Candidats à suppression : aucun.
Vérifié : `pnpm exec prettier --check` et `node scripts/check-repo.mjs` sur les fichiers touchés.
