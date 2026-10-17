import { createHash } from 'node:crypto';

import {
  AuditEntryIdSchema,
  newId,
  PersonaSchema,
  PersonaVersionIdSchema,
  type PersonaVersionSummary,
} from '@nirvana/contracts';
import { eq, schema, sql, withTenant, type Database, type Transaction } from '@nirvana/db';

import { canonicalJson } from '../../domain/canonical';
import { PersonaVersionConflict } from '../../domain/errors';
import type { PersonaVersionStore } from '../../domain/versions';

/** What `source_path` says of a version saved from the dashboard rather than loaded from a YAML file. */
const FROM_DASHBOARD = 'dashboard';

const columns = {
  id: schema.personaVersions.id,
  version: schema.personaVersions.version,
  contentHash: schema.personaVersions.contentHash,
  isActive: schema.personaVersions.isActive,
  createdAt: schema.personaVersions.createdAt,
};

interface SummaryRow {
  id: string;
  version: string;
  contentHash: string;
  isActive: boolean;
  createdAt: Date;
}

const toSummary = (row: SummaryRow): PersonaVersionSummary => ({
  id: PersonaVersionIdSchema.parse(row.id),
  version: row.version,
  contentHash: row.contentHash,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
});

const newestFirst = sql`${schema.personaVersions.createdAt} desc, ${schema.personaVersions.id} desc`;

const summaries = (tx: Transaction): Promise<SummaryRow[]> =>
  tx.select(columns).from(schema.personaVersions).orderBy(newestFirst);

const contentHash = (persona: unknown): string =>
  createHash('sha256').update(canonicalJson(persona)).digest('hex');

/** Postgres `unique_violation`: the (creator, version) pair already exists. */
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  [error, error.cause].some((e) => typeof e === 'object' && e !== null && 'code' in e && e.code === '23505');

export function createDrizzlePersonaVersionStore(db: Database): PersonaVersionStore {
  return {
    overview(creatorId) {
      return withTenant(db, creatorId, async (tx) => {
        const rows = await summaries(tx);
        const newest = rows[0];
        if (newest === undefined) return { creatorId, latest: null, versions: [] };
        const [content] = await tx
          .select({ content: schema.personaVersions.content })
          .from(schema.personaVersions)
          .where(eq(schema.personaVersions.id, newest.id));
        return {
          creatorId,
          latest: { summary: toSummary(newest), persona: PersonaSchema.parse(content?.content) },
          versions: rows.map(toSummary),
        };
      });
    },

    async create(creatorId, body, userId) {
      const persona = PersonaSchema.parse(body.persona);
      const hash = contentHash(persona);
      const id = newId(PersonaVersionIdSchema);
      try {
        return await withTenant(db, creatorId, async (tx) => {
          // One save at a time per creator, so two edits started from the same version cannot both pass.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`persona:${creatorId}`}))`);
          const [newest] = await summaries(tx);
          if ((newest?.contentHash ?? null) !== body.basedOn) throw new PersonaVersionConflict();
          const [row] = await tx
            .insert(schema.personaVersions)
            .values({
              id,
              creatorId,
              version: persona.meta.version,
              sourcePath: FROM_DASHBOARD,
              content: persona,
              contentHash: hash,
              isActive: false,
              createdBy: userId,
            })
            .returning(columns);
          await tx.insert(schema.auditLog).values({
            id: newId(AuditEntryIdSchema),
            userId,
            action: 'persona_version.create',
            entity: 'persona_version',
            entityId: id,
            details: { creatorId, version: persona.meta.version, contentHash: hash },
          });
          if (row === undefined) throw new Error('persona version insert returned nothing');
          return toSummary(row);
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new PersonaVersionConflict();
        throw error;
      }
    },
  };
}
