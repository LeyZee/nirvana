import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { z } from 'zod';

/**
 * AES-256-GCM for platform sessions and other secrets at rest (security.md). Keys are versioned,
 * `SESSION_ENCRYPTION_KEYS=v2:<base64>,v1:<base64>`, newest first: new secrets use the first key, old ones stay
 * readable until `ops:reencrypt-sessions` rewrites them. Layout: version length (1 byte), version, IV (12), tag
 * (16), ciphertext. `context` (a platform account id, say) is bound as associated data: a ciphertext moved to
 * another row does not decrypt.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptionKey {
  readonly version: string;
  readonly key: Buffer;
}

const KeySchema = z
  .string()
  .regex(/^[a-z0-9]{1,16}:[A-Za-z0-9+/=]+$/, 'expected <version>:<base64>')
  .transform((entry) => {
    const separator = entry.indexOf(':');
    return { version: entry.slice(0, separator), key: Buffer.from(entry.slice(separator + 1), 'base64') };
  })
  .refine((parsed) => parsed.key.length === 32, 'each key must be 32 bytes (openssl rand -base64 32)');

/** Parses the env value; the first key encrypts, all of them decrypt. */
export function parseEncryptionKeys(value: string): EncryptionKey[] {
  const keys = z
    .array(KeySchema)
    .min(1)
    .parse(value.split(',').map((entry) => entry.trim()));
  const versions = new Set(keys.map((k) => k.version));
  if (versions.size !== keys.length) throw new Error('SESSION_ENCRYPTION_KEYS has a duplicate version');
  return keys;
}

export function encryptSecret(plaintext: string, keys: readonly EncryptionKey[], context: string): Buffer {
  const current = keys[0];
  if (current === undefined) throw new Error('no encryption key');
  const version = Buffer.from(current.version, 'utf8');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', current.key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([version.length]), version, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptSecret(sealed: Buffer, keys: readonly EncryptionKey[], context: string): string {
  const versionLength = sealed.readUInt8(0);
  const version = sealed.subarray(1, 1 + versionLength).toString('utf8');
  const key = keys.find((k) => k.version === version);
  if (key === undefined) throw new Error(`no key for version ${version}`);
  const ivStart = 1 + versionLength;
  const tagStart = ivStart + IV_BYTES;
  const dataStart = tagStart + TAG_BYTES;
  const decipher = createDecipheriv('aes-256-gcm', key.key, sealed.subarray(ivStart, tagStart));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(sealed.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(sealed.subarray(dataStart)), decipher.final()]).toString('utf8');
}

/** The version that sealed a secret, to find the ones to re-encrypt after a key rotation. */
export function keyVersionOf(sealed: Buffer): string {
  return sealed.subarray(1, 1 + sealed.readUInt8(0)).toString('utf8');
}
