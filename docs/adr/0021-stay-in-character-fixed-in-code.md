# 0021. Rester en personnage est fixé dans le code, sans réglage

Statut : accepted (Charles, 19/10 14h11 : « Retirer »)
Date : 2026-10-19
Remplace : ADR 0012

## Contexte

L'ADR 0012 prévoyait un réglage `CreatorSettings.identity_policy` (`stay_in_character`, `deflect_and_handoff`, `disclose`), défaut `stay_in_character`. La revue 09 (G16) a montré que ce réglage n'était lu nulle part : le comportement réel est déjà fixé dans le code, par le prompt de la voix et par la garde bloquante `ai_disclosure`, revérifiée à chaque approbation (G5). Le réglage était décoratif : un écran aurait pu laisser croire qu'il changeait quelque chose. Charles a choisi de le retirer.

Les faits consignés par l'ADR 0012 restent vrais et notés ici pour la même raison : l'AI Act (art. 50) prévoit une obligation de transparence, et la politique d'usage de xAI interdit de ne pas être transparent sur l'usage de l'IA. La décision appartient à Charles.

## Décision

- Le bot ne dit jamais qu'il est une IA et ne parle jamais comme une IA. Ce n'est ni un réglage ni un sujet de prompt.
- Quand un fan demande s'il parle à un bot, le cerveau le note (`asks_if_bot`) et la voix répond en personnage (humour, détournement).
- La garde `ai_disclosure` est bloquante, sans exception : un brouillon qui la déclenche ne part pas, en automatique comme en copilote, retouché ou non.
- `IdentityPolicy` et `CreatorSettings.identityPolicy` disparaissent du contrat. Les réglages déjà stockés gardent la clé, que la lecture ignore (le schéma retire les clés inconnues) : aucune migration.

## Conséquences

- Un seul comportement, celui que Charles a demandé, et aucun réglage qui ferait croire à un autre.
- Changer d'avis (autre créatrice, autre contexte juridique) demande une nouvelle ADR et du code : la garde, le prompt de la voix et les évals adversariales « es-tu un bot ? ».

## Alternatives rejetées

- **Garder le réglage en le lisant** : ajoute deux comportements que personne n'a demandés et un risque de mauvaise manipulation.
- **Garder le réglage sans le lire** : c'est l'état que la revue a signalé.
