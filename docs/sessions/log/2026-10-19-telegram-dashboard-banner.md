# 2026-10-19 — P3-07 : bandeau Telegram sur le Dashboard — in_progress
Fait : `apps/web/src/settings/telegram/NightBanner.tsx` (règle pure `nightBannerOf`, adaptateur `telegramNightOf` depuis la réponse de `GET /v1/dashboard`), inséré sous le héros du Dashboard ; champ facultatif `telegram` dans le modèle d'écran (absent des données d'exemple). Réglages › Telegram distingue « Telegram éteint » (route absente, 404) d'une panne.
Pas fait : remplir `telegram` avec les vraies données : une ligne dans le branchement de `useDashboard` du fil Extension (`telegram: telegramNightOf(réponse)`).
Décisions : rien quand les urgences arrivent dans un groupe (zéro bruit) ; ambre et sous le héros, pour ne pas disputer l’œil à une urgence (relecture Dashboard) ; « Telegram éteint » en ton neutre et sans bouton, la clé du serveur n’étant pas l’affaire de la créatrice ; Telegram éteint ne se lit jamais comme « aucun groupe » ; le compte de la nuit (`guards.telegramAlertsTonight`) reste à la carte Gardes, pas au bandeau.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : `pnpm check` ✓, `pnpm --filter @nirvana/web test` ✓ ; bandeau et page « éteint » vus dans Chromium, bureau et 390 px, sans débordement ni erreur console.
