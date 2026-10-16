// Promptfoo runner (docs/playbooks/write-an-eval.md). The scenarios, rubrics and LlmGateway wiring arrive with the
// eval task cards; until then `pnpm evals` only explains what it will do.
const flags = process.argv.slice(2).filter((flag) => flag !== '--');

console.log(
  [
    'Aucune évaluation pour l’instant.',
    'pnpm evals lancera Promptfoo sur evals/scenarios et evals/adversarial contre LlmGateway,',
    'avec la persona et le fournisseur choisis (--persona, --provider, --full, --file).',
    `Options reçues : ${flags.length > 0 ? flags.join(' ') : 'aucune'}.`,
  ].join('\n'),
);
