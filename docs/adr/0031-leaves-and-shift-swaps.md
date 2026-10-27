# 0031. Congés et échanges de shift : le congé appartient au membre, l'échange se fait entre chatteurs

Statut : proposed
Date : 2026-10-27
Remplace : dans l'ADR 0023 (§ Données et RLS), « congés » dans la phrase « Shifts, rapports, congés et échanges portent `creator_id` **et** `member_id` »

## Contexte

L'ADR 0023 range les congés avec les shifts, les rapports et les échanges : chaque ligne porterait une créatrice et un membre, et la RLS demanderait les deux. La raison donnée vaut pour les rapports : deux chatteurs d'une même créatrice ne doivent pas lire leurs montants.

Un congé n'est pourtant pas pris sur une créatrice : « du 24 au 26 décembre », le membre est absent pour toutes les créatrices sur lesquelles il travaille. Avec une créatrice sur la ligne, il faudrait écrire un congé par créatrice et les garder d'accord. Et quand la liste des créatrices du membre change, un congé déjà validé ne couvrirait pas la nouvelle.

Pour les échanges, Charles a tranché le 27/10 (carte de 20h39, « Comme Imperium, sans manager ») : le chatteur choisit un collègue, le collègue accepte, et l'échange se fait aussitôt. Le manager est prévenu et peut l'annuler. La fiche EQ-02 prévoyait qu'un manager valide les échanges ; ce n'est plus le cas.

## Décision

**Un congé appartient au membre.** La table des congés porte `member_id` et pas de créatrice. Elle suit la politique des tables de l'équipe (ADR 0023 § Données et RLS) : un membre lit ses congés, et le scope `agency` (le propriétaire ou un manager actif) lit tout. Une créatrice ne lit aucun congé.

- Le membre demande son congé, en jours de son propre fuseau. Le serveur fixe les deux instants du congé à la création, pour qu'un changement de fuseau ne le déplace pas.
- Le propriétaire ou un manager actif valide ou refuse. Un manager ne décide jamais de son propre congé.
- Avant la validation, plus aucun shift du membre ne couvre la période : le manager les a donnés à quelqu'un d'autre ou annulés. Sinon la validation répond 409 avec ces shifts, pour qu'aucun compte ne se retrouve sans personne sans qu'on l'ait vu.
- Pendant un congé validé, aucun shift ne se pose sur le membre : ni à la main, ni par un modèle, ni par un échange. L'occurrence d'un modèle qui tombe dans le congé apparaît dans le planning, en ambre, comme un shift à pourvoir.
- Le statut du membre (`on_leave`, EQ-01) ne change pas tout seul. Il reste le réglage du propriétaire, qui décide aussi des droits d'un manager (ADR 0024).

**Un échange se fait entre chatteurs, sans manager.** Il porte les deux créatrices et les deux membres concernés ; la RLS de l'ADR 0023 s'y applique telle quelle : la créatrice d'un des deux shifts, **et** (le membre est l'un des deux, ou le scope est `agency`).

- Le chatteur propose un de ses shifts qui n'a pas commencé à un collègue actif de la même créatrice : soit il le lui donne, soit il l'échange contre un shift de ce collègue, sur une créatrice où lui-même travaille.
- Pour choisir, il voit le nom affiché de ces collègues et leurs shifts à venir qu'il pourrait prendre, rien d'autre (ni taux, ni pays, ni statut). C'est la seule porte par laquelle un chatteur lit le planning d'un autre.
- Le collègue accepte ou refuse. S'il accepte, les shifts changent de mains dans la même transaction, aux mêmes règles qu'un shift posé à la main (jamais deux shifts à la fois, jamais deux membres sur un compte, rien sur un membre en congé validé). Les autres propositions sur ces shifts tombent.
- Le propriétaire ou un manager actif voit chaque échange, et peut l'annuler tant qu'aucun des deux shifts n'a commencé : les shifts reviennent à leurs membres d'avant.

## Conséquences

- La table des congés ne prend pas de `creator_id`. Les autres points de l'ADR 0023 sur les données ne changent pas.
- La validation d'un congé, et chaque écriture qui pose un shift sur un membre, passent sous un même verrou par membre. Ainsi, un congé validé et un shift posé au même moment ne peuvent pas réussir tous les deux.
- `PlanningConflict` prend une troisième raison, `member_on_leave`, qui ne pointe vers aucun shift.
- Les rappels et les notifications d'un échange ou d'un congé viennent avec EQ-12. D'ici là, le manager voit les échanges et les congés dans le planning.
