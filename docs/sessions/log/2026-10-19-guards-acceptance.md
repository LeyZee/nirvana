# 2026-10-19 — Gardes de sortie : les contournements de la recette automatisée (R-G1) — done

Fait : les gardes bloquantes de `agent/domain/guards.ts` arrêtent les quatre phrases de la recette du 19/10 (annexe API G-2) et leurs variantes. Un numéro en lettres est compté en chiffres (« trente quatre » en vaut deux) : six suffisent après « zéro » ou un « 0 » en tête, quatre après « mon num », « mon tel »… ; une date (« 06/12/2024 ») n'est pas un numéro. L'aveu d'IA lit « IA » espacé ou ponctué après un article (« une i a », « une I-A », « un b o t »), ses synonymes (« assistante virtuelle », « algorithme ») et la négation d'être humaine ou réelle (« je suis pas humaine », « pas une vraie fille »). La promesse de rencontre se reconnaît à une invitation ou à un lieu (« viens me voir à Paris », « on se retrouve à », « on se fait un verre », « come see me ») ; ce qui reste sur la plateforme ou au lit passe (« viens me voir en privé », « au prochain live », « je t'attends au lit »).

Pas fait : rien.

Décisions : « viens me voir » seul est bloqué (un fan le lit comme une invitation) ; « je suis pas une vraie fille » suivi d'un mot (« sage ») passe.

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test` ; tests repris des phrases exactes de la recette, et une liste de phrases qui doivent passer (dates, heures, « il y a » écrit « i a », live, lit, privé).
