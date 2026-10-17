import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, keyVersionOf, parseEncryptionKeys } from './crypto';

const key = () => randomBytes(32).toString('base64');

describe('secret encryption', () => {
  it('round-trips with the newest key and records its version', () => {
    const keys = parseEncryptionKeys(`v2:${key()},v1:${key()}`);
    const sealed = encryptSecret('cookie=abc', keys, 'account-1');
    expect(keyVersionOf(sealed)).toBe('v2');
    expect(decryptSecret(sealed, keys, 'account-1')).toBe('cookie=abc');
    expect(sealed.includes(Buffer.from('cookie=abc'))).toBe(false);
  });

  it('still reads a secret sealed with an older key after a rotation', () => {
    const v1 = key();
    const sealed = encryptSecret('old', parseEncryptionKeys(`v1:${v1}`), 'account-1');
    expect(decryptSecret(sealed, parseEncryptionKeys(`v2:${key()},v1:${v1}`), 'account-1')).toBe('old');
  });

  it('refuses another context, a tampered byte, and a retired key', () => {
    const keys = parseEncryptionKeys(`v1:${key()}`);
    const sealed = encryptSecret('secret', keys, 'account-1');
    expect(() => decryptSecret(sealed, keys, 'account-2')).toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => decryptSecret(tampered, keys, 'account-1')).toThrow();
    expect(() => decryptSecret(sealed, parseEncryptionKeys(`v9:${key()}`), 'account-1')).toThrow(/v1/);
  });

  it('rejects malformed key lists', () => {
    expect(() => parseEncryptionKeys('')).toThrow();
    expect(() => parseEncryptionKeys('v1:c2hvcnQ=')).toThrow(/32 bytes/);
    expect(() => parseEncryptionKeys(`v1:${key()},v1:${key()}`)).toThrow(/duplicate/);
    expect(() => parseEncryptionKeys('replace-with-openssl-rand-base64-32')).toThrow();
  });
});
