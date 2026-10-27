# EQ-11 Shell par rôle : rail, barre du téléphone et gardes de route
Statut : todo (met en œuvre l'ADR 0024, acceptée par Charles le 27/10/2026)
Phase : équipe (ADR 0024)
Dépend de : ADR 0024 ; le rôle d'équipe dans `/v1/me` (EQ-01, par le propriétaire de `packages/contracts`)
Branche : task/eq-11-role-based-shell

## Objectif
Le rail, la barre du téléphone et les routes du CRM dépendent du rôle, avant le premier écran de l'équipe : chacun ne voit que ce qui le concerne.

## Contexte à lire
`docs/adr/0024-roles-and-navigation.md` en entier, `docs/design/README.md` (gestes des icônes, verre seulement sur ce qui flotte, contenu sur plaques), `packages/design-system/README.md`, le shell actuel d'`apps/web` (`AppShell`, routeur, `shell.css`, `SubNav`), la relecture du fil propriétaire d'`apps/web` sur #157.

## À faire
- [ ] Configuration du rail par rôle (propriétaire, manager, chatteur) dans l'ordre de l'ADR 0024, à la place de la liste statique ; `NavItem.to` élargi aux routes nouvelles, en français comme les routes existantes (`/creatrices`, `/suivi`, `/reglages`) : `/aujourdhui`, `/equipe`, `/paie`, `/planning`, `/commissions`, `/moi`. La créatrice a sa PWA (EQ-09).
- [ ] Un onglet n'apparaît que lorsque son écran existe : pas d'onglet vide ni grisé.
- [ ] Intertitres discrets Chatting et Agence dans le rail ; la lentille suit sans changement.
- [ ] Gardes `beforeLoad` sur `context.user` : une route interdite ramène sur le premier onglet du rôle (Aujourd'hui pour un chatteur, dès qu'EQ-10 le livre ; le Dashboard pour un manager). Les refus du serveur restent la vraie barrière.
- [ ] Téléphone : cinq emplacements, dont **Plus** quand il en faut davantage ; Plus ouvre une feuille de verre, qui est un dialogue modal accessible (focus piégé dedans, fermeture par Échap, retour du focus sur Plus) ; `sectionOf` rattache les sections débordées à Plus pour que l'onglet actif reste juste.
- [ ] Icônes Équipe, Paie, Moi et Plus, chacune avec son geste, dessinées dans le design system.
- [ ] Vérifier l'en-tête de la Paie entre 821 et 1 100 px de large ; repli : défilement horizontal de la `SubNav`.

## Critères d'acceptation
- Tests : chaque rôle voit exactement ses onglets, dans l'ordre de l'ADR 0024 ; un chatteur qui ouvre `/reglages` revient sur le premier onglet de son rôle ; la feuille Plus se ferme par Échap et garde le focus ; sur téléphone, Plus est actif quand la section affichée y est rangée.
- Le rail du propriétaire suit l'ADR 0024 dès cette PR : ses onglets, leur ordre et l'intertitre Chatting ; l'intertitre Agence n'apparaît que lorsque Équipe ou Paie existe.
- Aucune durée en dur ; captures avant et après, ordinateur et téléphone, Nuit et Jour.

## Hors périmètre
Les écrans de l'équipe (EQ-01 à EQ-06, EQ-10), la PWA de la créatrice (EQ-09).

## Notes de session
