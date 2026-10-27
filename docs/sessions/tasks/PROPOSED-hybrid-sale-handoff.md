# Mode hybride : passage à l'humain pour vendre, routage et attribution (ID à proposer)
Statut : proposed (lot 4 de l'ADR 0023, ID à valider par Charles)
Phase : 3-4 (moteur et Suivi), après la capture Reveal et les clés
Dépend de : fiche Planning, P6-01 (`sales`), le composeur de l'agent, ADR 0023 acceptée
Branche : task/<id>-hybrid-sale-handoff

## Objectif
Quand la méthode dit qu'il est temps de vendre, l'agent passe la main au chatteur en poste au lieu de dérouler un script, puis reprend la relation quand le chatteur rend la main ; chaque vente détectée revient à celui qui tenait la conversation.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Mode hybride), `docs/architecture/message-flow.md`, `docs/architecture/ai-engine.md` (la politique), `apps/api/src/modules/conversations/domain/state-machine.ts`, `docs/sessions/tasks/P6-01-sales-catalog.md`, ADR 0019, ADR 0020. Méthode de chatting : `/mnt/project-files/chatting/methode-chatting.md` (hors dépôt).

## À faire
- [ ] Contrats : cause `sale` du passage à l'humain ; réglage par créatrice « Qui vend » (`agent` | `team` | `both`) ; auteur d'une vente (`agent` ou un utilisateur).
- [ ] Politique : là où `offerDecision` autoriserait un script, si « Qui vend » vaut `team` (ou `both` avec quelqu'un en poste), le code produit un passage à l'humain `sale` au lieu du script. Les drapeaux du fan gardent la priorité (« ne plus écrire », ventes gelées).
- [ ] Supervision : la ligne À traiter d'une cause `sale` va d'abord au membre en poste (`scheduling.onShift`) ; sans personne, à tous.
- [ ] Attribution : à la détection d'une vente, l'auteur est le membre qui tenait la conversation à `detected_at` d'après le journal ; sinon l'agent. Délai de grâce après « Rendre la main » : réglage, 0 par défaut, à confirmer par Charles.
- [ ] Le brief de passation affiché au chatteur dit où en est le fan (KYC, dernières dépenses, scripts déjà joués) sans texte de prompt.

## Critères d'acceptation
- Tests du domaine : fan qui sexualise après le KYC minimum → `sale` ; même fan sous « ventes gelées » → rien ; « Qui vend = agent » → comportement actuel inchangé.
- Test contre `FakeReveal` : passage, prise en main, vente détectée attribuée au membre, rendre la main avec note, l'agent reprend avec l'aftercare.
- Évals : la reprise après une vente faite par un humain reste dans la voix de la créatrice.

## Hors périmètre
Commission sur une vente partagée entre agent et humain (règle unique : celui qui tient la conversation), contrôle qualité des ventes humaines.

## Notes de session
