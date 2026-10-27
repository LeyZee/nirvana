# EQ-10 Connexion et premier accès du chatteur
Statut : todo (demandée par Charles le 27/10/2026 : « il faut travailler l'interface chatteur, le login pour chaque chatteur »)
Phase : équipe (ADR 0023, ADR 0024)
Dépend de : EQ-01 (le compte et la fiche du membre), EQ-11 (le shell par rôle) ; les étapes contrat, mandat et dossier se branchent sur EQ-06 quand elle existe
Branche : task/eq-10-chatter-sign-in

## Objectif
Chaque chatteur se connecte à son propre espace, depuis son téléphone ou son ordinateur, sans e-mail ni Telegram. Son premier accès le guide jusqu'à Aujourd'hui : mot de passe, contrat et mandat, dossier.

## Contexte à lire
`docs/adr/0023-team-management.md`, `docs/adr/0024-roles-and-navigation.md`, `apps/api/src/auth.ts` (Better Auth : e-mail et mot de passe, inscription publique fermée), `docs/conventions/security.md`, `docs/architecture/threat-model.md`, EQ-01, EQ-06. Nirvana n'envoie pas d'e-mails aujourd'hui ; les chatteurs, souvent au Bénin ou à Madagascar, reçoivent leurs liens par WhatsApp.

## À faire
- [ ] **Lien d'invitation** (`invitation_link`) : à la création d'un membre (EQ-01), le propriétaire obtient un lien à usage unique, valable 72 h, qu'il copie ou partage avec la feuille de partage du téléphone. Le jeton est aléatoire (au moins 128 bits), gardé haché, absent de tout log et de toute URL de redirection ; un nouveau lien annule le précédent ; un membre parti n'en reçoit plus.
- [ ] **Premier accès**, une étape par écran, repris là où il s'était arrêté : choisir son mot de passe (règles de Better Auth déjà en place), vérifier son nom et son pays, accepter le contrat de prestation et le mandat de facturation (textes et versions d'EQ-06 ; tant qu'EQ-06 n'existe pas, l'étape est sautée et réclamée ensuite), remplir son dossier prestataire et déposer les pièces de son pays (EQ-06), puis arriver sur Aujourd'hui.
- [ ] **Mot de passe oublié** : sans e-mail, le propriétaire génère un lien de réinitialisation (mêmes règles que l'invitation). La réinitialisation révoque toutes les sessions du membre.
- [ ] **Connexion** : la page de connexion existante, pour tous les rôles. Après connexion, le rail du rôle (ADR 0024) et l'arrivée sur Aujourd'hui pour un chatteur. Le limiteur de tentatives existant s'applique ; un membre marqué parti perd ses sessions (EQ-01).
- [ ] **Aujourd'hui** (chatteur) : son shift en cours ou le prochain (EQ-02), « Faire mon rapport » à la fin du shift (EQ-03), son objectif (EQ-05), les annonces. Une brique qui n'existe pas encore n'apparaît pas ; état vide honnête quand il n'a pas de shift.
- [ ] `audit_log` pour la création, l'utilisation et l'annulation d'un lien, et pour chaque réinitialisation.
- [ ] Textes en français, apostrophes typographiques, design system, animations de ses jetons, aucune durée en dur ; écrans pensés d'abord pour un téléphone.

## Critères d'acceptation
- Tests : un lien utilisé deux fois est refusé ; un lien expiré est refusé ; un nouveau lien annule l'ancien ; le jeton n'apparaît dans aucun log ; un membre parti ne peut pas utiliser un lien ; une réinitialisation révoque les sessions ouvertes.
- Un chatteur connecté arrive sur Aujourd'hui ; une route qui n'est pas la sienne le ramène sur Aujourd'hui, et l'API répond 403.
- Aucun vrai prénom, numéro ni pièce dans les tests et les captures (ADR 0010).

## Hors périmètre
Envoi d'e-mails, notifications sur le téléphone, double authentification, espace de la créatrice (EQ-09).

## Notes de session
