/**
 * Terminal playground: talk to the persona as a fan, through the production path, with nothing ever sent.
 * Usage: `pnpm playground --persona <path to a persona YAML>` (LLM_XAI_API_KEY in the environment).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import {
  createJsonlCallLog,
  createLlmGateway,
  createModelResolver,
  DEFAULT_LLM_CONFIG,
  readProviderCredentials,
} from '@nirvana/llm';

import { DEFAULT_GUARD_SETTINGS } from '../modules/agent/index';

import { readPersonaFile } from './persona-file';
import { createPlaygroundSession, type PlaygroundTurn } from './playground-session';

const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const pink = (s: string): string => `\x1b[95m${s}\x1b[0m`;

const { values } = parseArgs({
  options: { persona: { type: 'string' }, name: { type: 'string', default: 'Messa' } },
});
if (values.persona === undefined) {
  console.error('Usage: pnpm playground --persona <persona.yaml> [--name Messa]');
  process.exit(2);
}
const credentials = readProviderCredentials(process.env);
if (credentials.LLM_XAI_API_KEY === undefined && credentials.LLM_MISTRAL_API_KEY === undefined) {
  console.error(
    'No LLM key in the environment (LLM_XAI_API_KEY): set it as an environment variable, never in a file.',
  );
  process.exit(2);
}

// pnpm runs the script from apps/api; paths given by the user are relative to where they typed the command.
const cwd = process.env['INIT_CWD'] ?? process.cwd();
const repoRoot = resolve(import.meta.dirname, '../../../..');
const scratch = resolve(repoRoot, '.scratch/playground');
const today = new Date().toISOString().slice(0, 10);
const persona = readPersonaFile(readFileSync(resolve(cwd, values.persona), 'utf8'), values.name, today);
const log = createJsonlCallLog(resolve(scratch, 'llm-calls.jsonl'));
const gateway = createLlmGateway({
  config: DEFAULT_LLM_CONFIG,
  credentials,
  resolveModel: createModelResolver(credentials),
  log,
});
const session = createPlaygroundSession({
  gateway,
  creatorName: persona.creatorName,
  personaSheet: persona.personaSheet,
  guardSettings: { ...DEFAULT_GUARD_SETTINGS, forbiddenTerms: persona.forbiddenTerms },
});

let showBrief = true;

function print(turn: PlaygroundTurn): void {
  if (showBrief && turn.brief) {
    const b = turn.brief;
    console.log(
      dim(
        `  brief  ${b.intent} · ${b.sentiment} · ${b.action}${b.risks.length > 0 ? ` · RISQUES ${b.risks.join(', ')}` : ''}`,
      ),
    );
    console.log(dim(`         ${b.replyBrief}`));
  }
  if (turn.briefFailure !== undefined) console.log(red(`  brief  échec (${turn.briefFailure})`));
  for (const bubble of turn.bubbles)
    console.log(turn.isBlocked ? red(`  ✗ ${bubble}`) : pink(`  ${persona.creatorName} › ${bubble}`));
  if (turn.voiceFailure !== undefined) console.log(red(`  voix   échec (${turn.voiceFailure})`));
  for (const v of turn.violations) {
    console.log(red(`  garde  ${v.code} (${v.severity})${v.match !== undefined ? ` « ${v.match} »` : ''}`));
  }
  const cost = `${(turn.costUsd * 100).toFixed(3)} ¢`;
  console.log(
    dim(
      `  ${turn.model ?? '—'}${turn.isFallback ? ' (repli)' : ''} · ${String(turn.latencyMs)} ms · ${cost}`,
    ),
  );
}

console.log(
  pink(`Playground ${persona.creatorName}`) +
    dim(' — rien n’est jamais envoyé. /brief /notes /health /save /reset /quit'),
);
const rl = createInterface({ input: process.stdin, output: process.stdout });
for (;;) {
  const line = (await rl.question('fan › ')).trim();
  if (line === '') continue;
  if (line === '/quit') break;
  if (line === '/reset') {
    session.reset();
    console.log(dim('  conversation remise à zéro'));
    continue;
  }
  if (line === '/brief') {
    showBrief = !showBrief;
    continue;
  }
  if (line === '/notes') {
    console.log(
      dim(session.fanNotes.length > 0 ? session.fanNotes.map((n) => `  ${n}`).join('\n') : '  aucune note'),
    );
    continue;
  }
  if (line === '/health') {
    const report = gateway.health();
    console.log(
      dim(
        `  état ${report.state} · aujourd’hui ${report.costTodayUsd.toFixed(4)} $ / ${String(report.dailyBudgetUsd)} $`,
      ),
    );
    for (const r of report.roles)
      console.log(
        dim(
          `  ${r.role.padEnd(6)} ${r.state.padEnd(9)} ${r.active.label}${r.isOnFallback ? ' (repli actif)' : ''}`,
        ),
      );
    continue;
  }
  if (line === '/save') {
    mkdirSync(scratch, { recursive: true });
    const file = resolve(scratch, `conversation-${String(Date.now())}.json`);
    writeFileSync(file, JSON.stringify({ history: session.history, notes: session.fanNotes }, null, 2));
    console.log(dim(`  enregistré dans ${file}`));
    continue;
  }
  print(await session.handleFanMessage(line));
}
rl.close();
