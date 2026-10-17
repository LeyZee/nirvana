import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

/**
 * Asks for a secret on the terminal without echoing it: the prompt is shown, the keystrokes are not. Nothing goes
 * through an argument either, so the secret stays out of the shell history and off the screen.
 */
export async function readSecret(
  prompt: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<string> {
  let isMuted = false;
  const screen = new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      if (!isMuted) output.write(chunk);
      done();
    },
  });
  const terminal = createInterface({ input, output: screen, terminal: true });
  try {
    const answer = terminal.question(prompt);
    isMuted = true;
    const secret = await answer;
    output.write('\n');
    return secret;
  } finally {
    terminal.close();
  }
}
