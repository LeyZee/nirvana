# 2026-10-28 — P5-01 « À apprendre » dans le Suivi (Extension) — done
Fait :
- Lecteur du Suivi : sous « Limites du fan », une ligne neutre « À apprendre » avec les lignes du canevas encore vides pour ce fan, dans l'ordre de sa persona (`FanToLearn.tsx`, `fetchFanKyc` sur `GET /v1/fans/:id/kyc?creatorId=`, libellés `KYC_SLOT_LABELS`).
- Rien quand tout est appris, pendant le chargement ou quand le serveur ne répond pas (le lecteur le dit déjà) ; jamais demandée pour une créatrice, à qui le serveur répond 403 (ADR 0023). Relue toutes les 30 s, puisqu'un fait arrive avec un message du fan.
- Tests : `TrackingPage.test.tsx` (ligne dans son ordre et sans ambre, rien quand la liste est vide, aucun appel pour une créatrice).
Pas fait : rien de cette ligne.
Décisions : la ligne prend la forme du résumé des limites (titre à gauche, lignes à droite) sans être repliable, puisqu'il n'y a rien à régler.
Découvertes : à 400 px, l'en-tête du lecteur fait chevaucher la pastille « Un humain répond » et le bouton « Rendre la main à l'agent » (avant cette PR, Extension).
Candidats à suppression : aucun.
Vérifié : pnpm check ; tests du Suivi (77) ; captures Nuit et Jour, 1 440 et 400 px, sur le serveur de dev.
