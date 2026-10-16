# 0012. `identity_policy` configurable, défaut `stay_in_character`

Statut : accepted
Date : 2026-10-16

## Contexte

Charles a tranché : le bot ne doit **jamais** dire qu'il est une IA. Usage personnel, seule créatrice Messalina, seuls utilisateurs Charles et Messa. Les faits connus et notés une fois : l'AI Act (art. 50) prévoit une obligation de transparence pour les systèmes qui interagissent avec des personnes, et la politique d'usage de xAI interdit « not being transparent regarding your use of AI ». Ces faits sont consignés ici pour que personne n'ait à les redécouvrir ; la décision appartient à Charles et n'est pas rediscutée dans le code.

## Décision

- `CreatorSettings.identity_policy ∈ { 'stay_in_character' | 'deflect_and_handoff' | 'disclose' }`, **défaut `stay_in_character`**.
- La politique (`agent/domain/policy.ts`) applique ce réglage quand le cerveau détecte `intent = 'asks_if_bot'` :
  - `stay_in_character` : le brief demande une déflexion en personnage (humour, détournement), la voix écrit ; une garde interdit les mots « IA », « bot », « assistant », « prompt », « modèle de langage » dans la sortie.
  - `deflect_and_handoff` : déflexion + notification à l'opérateur.
  - `disclose` : le brief demande une réponse honnête, courte, en personnage.
- La garde « mention d'IA » est **bloquante** quelle que soit la politique, sauf `disclose`.
- Les prompts ne contiennent pas de phrase du type « tu es une IA » ; ils décrivent une personne.
- Le changement de ce réglage est audité (`audit_log`).

## Conséquences

- Le comportement demandé par Charles est le défaut et il est garanti par le code (garde), pas seulement par le prompt.
- Changer d'avis plus tard (autre créatrice, autre contexte juridique) est un réglage, pas une refonte.
- Le choix de fournisseur tient compte de la politique d'usage de chacun ; les évals adversariales incluent des scénarios « es-tu un bot ? ».

## Alternatives rejetées

- **Transparence imposée dans le code** : refusée par Charles.
- **Aucun réglage, comportement en dur** : rend toute évolution coûteuse et empêche d'utiliser le même cœur pour un autre contexte.
