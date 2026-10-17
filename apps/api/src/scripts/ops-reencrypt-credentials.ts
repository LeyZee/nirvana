/**
 * Re-seals every secret kept under CREDENTIALS_ENCRYPTION_KEYS with the newest key after a rotation
 * (runbooks/rotate-secrets.md): today the AI service keys of Réglages › Modèles IA; any later secret sealed with the
 * same keys (a Telegram bot token, for instance) adds its own re-sealer to the list below.
 * Usage: `pnpm ops:reencrypt-credentials`, with `CREDENTIALS_ENCRYPTION_KEYS=v2:<nouvelle>,v1:<ancienne>`.
 */
import { createDbClient, parseEncryptionKeys } from '@nirvana/db';

import { loadConfig, secretOrNull } from '../config';
import { resealProviderCredentials } from '../modules/providers';

const config = loadConfig();
const keys = secretOrNull(config.CREDENTIALS_ENCRYPTION_KEYS);
if (keys === null) {
  console.error('CREDENTIALS_ENCRYPTION_KEYS manque dans l’environnement.');
  process.exit(1);
}
const admin = createDbClient(config.DATABASE_ADMIN_URL);
try {
  const parsed = parseEncryptionKeys(keys);
  const services = await resealProviderCredentials(admin.db, parsed);
  console.log(
    `${String(services.rewritten)} clé(s) de service IA rechiffrée(s) en ${parsed[0]?.version ?? '?'}.`,
  );
  if (services.unreadable.length > 0) {
    console.error(
      `Illisible(s) avec ces clés : ${services.unreadable.join(', ')}. Ne retire pas l’ancienne clé de chiffrement : remets-la, relance la commande.`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await admin.close();
}
