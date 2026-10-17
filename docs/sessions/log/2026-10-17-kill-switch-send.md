# 2026-10-17 — L'arrêt d'urgence bloque aussi l'approbation et l'envoi — done
Fait : `approveDraft` relit les interrupteurs et la session (`gate.blockedReason`) et refuse en 409 (`kill_switch_conflict`, `session_expired_conflict`) en laissant le brouillon en attente ; le job `conversation.send` les relit avant chaque bulle et fait expirer le brouillon arrêté. Constat B1 de la revue à froid (/mnt/project-files/revue/09-revue-code-fondations.md).
Pas fait : le passage de `ops.ts` par les `index.ts` des modules (PR à part).
Décisions : un brouillon arrêté par l'interrupteur expire plutôt que d'attendre : rien ne part tout seul quand on lève l'arrêt ; le message suivant du fan donne un nouveau brouillon. Les enregistrements qui suivent un envoi déjà parti (message envoyé, échec, vérification) ne relisent pas l'interrupteur.
Découvertes : l'étape finale `send_verified` passe par `canSend` ; un message du fan arrivé pendant l'envoi de la dernière bulle fait expirer un brouillon déjà parti (à traiter avec G3).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, tests d'intégration conversations ✓ (23).
