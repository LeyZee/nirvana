# OnlyChat : analyse de l'outil de référence

Source : site public et documentation d'OnlyChat (octobre 2026), outil d'automatisation de chat pour OnlyFans. Observations, pas de code.

## Ce qu'il fait

- **Architecture** : extension Chrome qui capture la session, puis **tout tourne côté serveur** (« tient avec Chrome fermé »). C'est notre option B (ADR 0008).
- **Pas d'interface d'approbation** : le bot envoie directement. Nous commençons en copilote (approbation) et passons en auto par catégories (roadmap phase 5).
- **Notes sur le fan** en texte libre, éditées par l'opérateur. Nous structurons (`fan_facts` par catégorie avec confiance et historique) et gardons une note opérateur libre.
- **KYC** : 6 cibles d'information, ~100 messages / 6 h de rythme. Nous paramétrons les slots dans la persona et laissons la politique décider du moment.
- **Échelle de prix** avec remises bornées par un plancher appliqué **dans le code**, pas par le prompt. Repris tel quel comme principe (phase 6 : `offers`).
- **Cooldowns** entre offres, entre relances. Repris (`conversations.cooldowns`).
- **L'IA ne voit pas les médias** : elle vend des descriptions saisies à la main. Nous décrivons les médias par un modèle de vision (`sense`) avec un vocabulaire structuré, ce qui est un avantage net.

## Ce qu'on ne reprend pas

- Envoi direct sans supervision dès le départ.
- Notes libres comme seule mémoire.
- Dépendance à une seule plateforme.

## Ce qu'on fait mieux (objectif)

- Traçabilité de chaque décision (journal d'événements, brief, traces de politique et de gardes).
- Mémoire structurée et temporelle.
- Médias compris, pas décrits à la main.
- Gardes codées (dégoûts, identité, fuite inter-fans).
- Évals avant chaque changement de modèle ou de persona.
