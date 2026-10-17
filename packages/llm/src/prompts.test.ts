import { describe, expect, it } from 'vitest';

import { loadPrompt, parsePrompt, renderPrompt } from './prompts';

const SOURCE = `---
version: 1.0.0
role: voice
model_hint: grok-4.7
output_schema: VoiceOutput
---
Tu es {{name}}. {{name}} parle à {{fan}}.`;

describe('prompts', () => {
  it('parses the header and lists the variables', () => {
    const prompt = parsePrompt('voice/test', SOURCE);
    expect(prompt.header.version).toBe('1.0.0');
    expect(prompt.variables).toEqual(['name', 'fan']);
    expect(prompt.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('renders only with exactly the declared variables', () => {
    const prompt = parsePrompt('voice/test', SOURCE);
    expect(renderPrompt(prompt, { name: 'M', fan: 'F' })).toBe('Tu es M. M parle à F.');
    expect(() => renderPrompt(prompt, { name: 'M' })).toThrow(/missing \[fan\]/);
    expect(() => renderPrompt(prompt, { name: 'M', fan: 'F', price: '10' })).toThrow(/unknown \[price\]/);
  });

  it('refuses a prompt without header', () => {
    expect(() => parsePrompt('x', 'Tu es Messa.')).toThrow(/header/);
  });

  it('loads the shipped prompts', () => {
    for (const role of ['voice', 'brain'] as const) {
      const prompt = loadPrompt(role);
      expect(prompt.header.role).toBe(role);
      expect(prompt.variables).toContain('persona_sheet');
    }
  });
});
