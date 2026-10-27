# 0023. La gestion d'équipe entre dans Nirvana : planning, rapports, paie, routine des créatrices

Statut : proposed
Date : 2026-10-27
Remplace : la ligne « pont Imperium (export) » de la phase 6 (`docs/roadmap.md`) et l'idée d'un Imperium client de l'API Nirvana (`brainstorm/02-architecture-et-stack.md` §1.3)

## Contexte

Imperium (`LeyZee/imperium`, Express + SQLite) gérait l'équipe de chatteurs de l'agence : planning des shifts, ventes déclarées, paie et factures automatiques, routine quotidienne des créatrices dans une PWA. Il est à l'arrêt. Charles recrute de nouveaux chatteurs et veut retrouver ces fonctions dans Nirvana, avec le design system de Nirvana, un code propre et une paie « vraiment fiable et robuste » (27/10/2026). Les chatteurs font désormais leur rapport de fin de shift dans l'application : l'équipe ne dépend plus de Telegram.

Charles veut aussi un mode **hybride** : l'agent tient la relation avec les fans, des chatteurs vendent (l'agent peut vendre aussi). Le moteur sait déjà passer la main à un humain (`handoff`), un humain sait la prendre (`takeover`) et la rendre avec une note (`release`, `operator_note`).

La règle de `docs/reference/legacy-projects.md` tient : on reprend les concepts d'Imperium, jamais son code.

## Décision

### Modules

- `team` : le profil d'un membre de l'équipe, lié à son compte (`user`) : rôle d'équipe (`chatter` ou `manager`), pays, fuseau, mode de rémunération, taux, statut. Les paramètres d'une plateforme utiles à la paie (TVA, commission de la plateforme, devise) et la part de l'agence sur une créatrice s'ajoutent aux tables existantes.
- `scheduling` : shifts par créatrice, créneaux, modèles récurrents, congés, échanges, et la question « qui est en poste sur cette créatrice maintenant ? ». Les rapports de fin de shift y vivent.
- `payroll` : périodes, calcul, primes, malus, report, verrou, fiches de paie, factures.
- `creator-tasks` : routine de l'agence et tâches personnelles des créatrices, complétions, série. Servi par la PWA de la phase 5.
- `sales` (P6-01) devient le registre des ventes détectées, et chaque vente porte son **auteur** : l'agent, ou le membre de l'équipe qui tenait la conversation.

Chaque module suit `docs/architecture/modules.md`. Aucune de ces fonctions ne passe par Telegram ; le module `telegram` garde les alertes (ADR 0020) et n'est pas une dépendance de l'équipe.

### Rôles

Pas de nouveau rôle d'accès. Le chatteur et le manager sont des `operator` (`creator_ids` borne leurs créatrices) ; le rôle d'équipe (`team_members.team_role`) dit ce qu'un manager voit en plus : toute l'équipe, la validation des rapports et des paies jusqu'à « validée ». Seul l'`owner` marque une paie « payée ». La `creator` voit sa routine, ses revenus, ses factures et qui est en poste, jamais une conversation ni un fan.

### Une seule source de revenus par compte

Pour chaque compte plateforme, la paie lit **une** source par période : les montants **déclarés** dans les rapports de fin de shift validés, ou les ventes **détectées** par le connecteur. Le choix est un réglage du compte, il ne change qu'à une frontière de période. Une même vente ne peut donc jamais compter deux fois. Tant que le connecteur Reveal n'écrit pas les ventes, tous les comptes sont en « déclaré ».

### Paie

- Le calcul est une fonction pure du domaine de `payroll` : mêmes entrées, même fiche, sans horloge ni accès à la base.
- Argent en unités mineures entières (ADR 0011). Ordre de calcul par compte : brut → conversion en euros → hors TVA → net de la commission de la plateforme → part du membre. Arrondi au centime, demi vers le haut, après chacune de ces étapes et nulle part ailleurs.
- Le taux de change utilisé (valeur, source, date) et toutes les règles appliquées (taux du membre, TVA, commission, paliers, primes) sont **copiés dans la fiche** : recalculer une fiche validée redonne le même résultat au centime.
- États : `draft` (recalculée à chaque changement de ses entrées) → `validated` (figée, facture numérotée) → `paid` (immuable). Une correction après validation est une ligne d'ajustement sur la prochaine période ouverte, jamais une modification.
- Les malus sont plafonnés à la part du membre plus ses primes : une fiche n'est jamais négative. Un total sous le minimum de versement est reporté sur la période suivante par un registre idempotent.
- Modes de rémunération : commission, à l'heure (heures des shifts effectués), ou les deux. Un manager peut toucher une part du net de l'équipe.
- Périodes : quinzaines (1-15, 16-fin du mois) dans le fuseau de l'agence, un nouveau réglage (Europe/Paris par défaut).
- Toute écriture passe par `audit_log` avec son auteur.

### Factures

Une facture est produite à la validation, numérotée sans trou, et son PDF n'est plus jamais régénéré. Imperium émettait la facture au nom du chatteur vers l'agence (autofacturation) avec une numérotation commune : le mandat d'autofacturation et le mode de numérotation sont confirmés par le comptable de l'agence avant la première facture réelle.

### Mode hybride

- Nouveau motif de passage à l'humain : `sale`. Il est posé par le code quand la méthode dit qu'il est temps de vendre (le fan sexualise après le KYC minimum, ou le curseur de la créatrice est atteint), à la place d'un script.
- Un réglage par créatrice, « Qui vend » : l'agent, l'équipe, ou les deux. Avec « l'équipe » ou « les deux », la ligne À traiter part au membre en poste sur cette créatrice ; sans personne en poste, elle reste dans À traiter pour tous et, avec « les deux », l'agent vend.
- Une vente détectée revient au membre qui tenait la conversation à cet instant (le journal garde qui a pris la main et quand) ; sinon à l'agent, sans commission.
- Rien ne change pour le mode Copilote ni pour l'Automatique (ADR 0019) : les messages de relation de l'agent restent validés tant que l'Automatique est fermé.

### Données et RLS

- Shifts et rapports portent `creator_id` : RLS par créatrice, comme le reste.
- Les tables de l'équipe et de la paie sont à l'échelle de l'agence, sans `creator_id`. Elles reçoivent une politique par utilisateur : un membre ne lit que ses lignes, le propriétaire et un manager lisent tout. Le mécanisme exact (`withMember` à côté de `withTenant`) est posé par le propriétaire de `packages/db` au premier lot.
- Aucune donnée d'Imperium n'est importée par défaut. Si Charles veut l'historique, un import ponctuel tourne hors du dépôt (vrais prénoms, coordonnées bancaires : ADR 0010).

### Navigation

Un onglet **Équipe** (Membres, Planning, Rapports, Paie) pour le propriétaire et les managers. Un chatteur a un espace resserré : Suivi, Mon planning, Mes rapports, Ma paie. La créatrice a sa PWA. Sur téléphone, la barre garde au plus cinq onglets ; la disposition se décide avec le design system.

### Ordre

Lot 0 (cet ADR, le glossaire, les fiches) → 1 Équipe → 2 Planning → 3 Rapports et paie → 4 Hybride (après la capture Reveal et les clés) → 5 PWA de la créatrice → plus tard : facturation des créatrices et pénalités de retard, rapprochement bancaire, ventes Telegram Stars, trafic des liens, coaching, gamification. Les lots 1 à 3 n'attendent que du code.

## Conséquences

- Les nouveaux chatteurs sont gérés dans le même outil que l'agent, avec la même authentification et le même design.
- La paie devient vérifiable : une fiche contient tout ce qui l'explique, et un test peut la recalculer.
- Le rapport de fin de shift reste une déclaration : sa justesse dépend de la validation par un humain tant que le connecteur ne lit pas les ventes.
- Deux dépendances nouvelles se décident dans leurs fiches : la génération de PDF et, si besoin, une bibliothèque de tests par propriétés.

## Alternatives rejetées

- **Relancer Imperium à côté** et le relier par l'API : deux piles, deux authentifications, un design daté, et le parsing Telegram dont Charles ne veut plus.
- **Porter le code d'Imperium** : contraire à la règle des concepts ; JavaScript, SQLite et logique dans les routes.
- **Additionner déclaré et détecté** sur un même compte : double comptage dès que le connecteur lit les ventes.
- **Un rôle d'accès `manager`** : il dupliquerait toutes les règles d'`operator` ; un rôle d'équipe suffit.
