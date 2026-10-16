# 0013. Code en anglais, documentation, UI et persona en français

Statut : accepted
Date : 2026-10-16

## Contexte

Les utilisateurs (Charles, Messa) et les fans sont francophones. Les sessions de code sont des agents qui lisent et écrivent le code plus naturellement en anglais, et l'écosystème (bibliothèques, erreurs, Stack Overflow) est anglophone.

## Décision

- **Code** (identifiants, commentaires, messages de commit, noms de fichiers, noms de jobs, types d'événements, clés de config) : **anglais**.
- **Documentation** (`docs/`, READMEs, ADR, fiches de tâches, LOG) : **français**.
- **Interface** du dashboard et textes utilisateur : **français** (pas d'i18n avant qu'une deuxième langue existe).
- **Persona et prompts de la voix** : **français** (c'est la langue du résultat). Les prompts du cerveau et du sens peuvent être en anglais (meilleure adhérence des modèles aux schémas), avec les sorties textuelles en français quand elles sont relues par un humain.
- Le glossaire (`docs/glossary.md`) fixe la correspondance FR → EN des termes métier ; un terme absent du glossaire se discute avant d'apparaître dans le code.

## Conséquences

- Pas d'ambiguïté sur « quelle langue ici ». Les noms de code sont stables et recherchables ; les docs sont lisibles par Charles et Messa.
- Coût : tenir le glossaire.

## Alternatives rejetées

- **Tout en français** : identifiants accentués, frottement avec l'écosystème.
- **Tout en anglais** : docs moins accessibles à Messa ; persona en traduction.
