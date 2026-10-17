# 2026-10-17 — `takeover_started` nomme sa conversation — done
Fait : `takeover_started` porte `conversationId` (journal et outbox), pour qu'une alerte Telegram envoyée pour la conversation se ferme sur « ✓ Pris en main par … » (ADR 0020 §11, demande de #59). Test d'intégration : en attente d'un humain, le bot ne compose plus rien et n'écrit aucun brouillon, quoi que le fan envoie, même quand un job `conversation.respond` posé avant le passage à l'humain est rejoué (fiche P3-07).
Pas fait : le branchement du module `telegram` (jobs, composition-root, worker, crontab), dans la PR suivante, après #59.
Décisions : `conversationId` est obligatoire sur `takeover_started` seulement ; `takeover_ended` et `mode_changed` gardent leur contenu.
Découvertes : la contrainte `*_type_check` en base ne connaissait pas `budget_threshold_crossed` (#54, sans migration) ; 0006 de #59 la rattrape. Une vérification d'écart schéma / migrations suivra avec le branchement.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, tests d'intégration conversations ✓ (21).
