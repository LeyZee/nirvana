# 2026-10-22 — D-01 Refonte : coquille et Dashboard — done
Fait : barre latérale flottante en verre (flamme et nom, icône et libellé côte à côte, lentille neutre, compte en bas), réduite aux icônes sous 1 100 px, capsule d'onglets flottante sous 820 px ; la page défile sous la barre, contenu limité à 1 240 px ; titres de page en grand, sous-onglets en capsule de verre, panneaux en plaques. Dashboard : héros posé sur le fond avec une seule lumière, sections en plaques séparées par l'espace, info-bulle refermée au défilement de la page. Le point d'un mode non choisi reste éteint : le rouge d'Arrêt ne s'allume que si l'agent est arrêté (recette R-C3).
Pas fait : les autres onglets (une PR chacun) ; la part agent des Meilleurs fans en `data-1` (fil Dashboard, A-11).
Décisions : aucune.
Découvertes : `nv-enter` floute pendant l'entrée, donc comme `transform` il capture un enfant `position: fixed` le temps de l'animation ; ce qui flotte passe par un portail (déjà le cas des info-bulles et dialogues). `.nv-tabbar__lens` n'a pas de `border-radius` sans `nv-glass` (sans usage dans les apps aujourd'hui).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓, captures de chaque onglet à 1 440 et 390 px dans Chromium avec des données d'exemple.
