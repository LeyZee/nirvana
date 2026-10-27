# EQ-19 « Voir comme » : l'écran exact d'un chatteur, en lecture seule
Statut : todo (ID validé par Charles le 27/10/2026, 15h11 : « travail sur tout ça aussi »)
Phase : équipe (ADR 0023, ADR 0024)
Dépend de : EQ-10 (espace du chatteur), EQ-11 (shell par rôle), EQ-15 (code redemandé), EQ-18 (journal)
Branche : task/eq-19-view-as

## Objectif
Pour aider un chatteur qui dit « je ne vois pas mon shift » ou « ma commission est fausse », le propriétaire ou un manager actif voit exactement ce que ce chatteur voit, sans pouvoir rien faire à sa place.

## Contexte à lire
ADR 0024 (§ Rôles et scopes), `packages/db/src/client.ts` (`withMember`), `apps/api/src/auth.ts`, `docs/conventions/security.md`, `docs/architecture/threat-model.md`, EQ-13 (accès borné au shift), EQ-15, EQ-18. Imperium avait « Voir comme » sans garde-fou : l'admin agissait avec la session du chatteur.

## À faire
- [ ] **Qui** : le propriétaire, pour tout membre ; un manager actif, pour un chatteur seulement. Jamais un chatteur, jamais pour voir le propriétaire. Ouvrir « Voir comme » redemande le code de double authentification s'il n'est pas récent (EQ-15).
- [ ] **Comment** : une vue en lecture seule portée par la session du propriétaire ou du manager, jamais par celle du chatteur (aucun jeton du chatteur n'est créé ni lu). Pendant la vue, le serveur calcule les lectures avec le scope et les créatrices du chatteur, bornes du shift comprises (EQ-13) : on voit ce qu'il verrait à cet instant, pas davantage. Toute écriture est refusée par le serveur (403), quel que soit l'écran.
- [ ] **Limites** : durée de la vue réglée par le propriétaire, fermeture au bout de ce délai ; jamais le mot de passe, la double authentification, les sessions ni les notifications du chatteur.
- [ ] **Bandeau** permanent « Tu vois l'écran de [nom affiché] — lecture seule », avec « Quitter » ; les boutons d'action restent visibles mais inactifs, pour que l'écran soit identique.
- [ ] `audit_log` à l'ouverture et à la fermeture (qui, pour qui, combien de temps) ; le chatteur voit dans Moi qui a regardé son écran et quand.
- [ ] Bouton « Voir comme » sur la fiche du membre (Équipe › Membres) ; design system, aucune durée en dur.

## Critères d'acceptation
- Tests : pendant la vue, chaque route d'écriture répond 403 ; une lecture renvoie ce que renverrait la session du chatteur au même instant, et rien de ce que le propriétaire verrait en plus ; un manager ne peut pas voir le propriétaire ni un autre manager ; un manager hors statut actif ne peut rien voir ; la vue se ferme à la fin du délai ; aucune session du chatteur n'est créée.
- Test : l'ouverture et la fermeture apparaissent dans le journal et dans Moi du chatteur.
- Finition (Charles, 27/10, 15h22 : « que ce soit vraiment très joli… des hovers partout… une belle hiérarchie des informations ») : chaque écran passe la barre de `docs/design/README.md` § Finition d'un écran, preuves comprises (captures Nuit et Jour, bureau et téléphone, mouvement réduit).

## Hors périmètre
Prise de contrôle à distance, partage d'écran, voir comme une créatrice.

## Notes de session
