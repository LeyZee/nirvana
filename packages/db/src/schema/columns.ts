/* eslint-disable @typescript-eslint/explicit-module-boundary-types -- Drizzle builder types are inferred; spelled out they are unreadable and the schema files only chain them. */
import { sql, type SQL } from 'drizzle-orm';
import { check, pgPolicy, text, timestamp, uuid, type PgColumn } from 'drizzle-orm/pg-core';

/** Shared column builders and the tenant policy (data-model.md, ADR 0005). */

/** Application-generated UUID v7 primary key (ADR 0011): no database default. */
export const id = () => uuid('id').primaryKey();

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const timestampTz = (name: string) => timestamp(name, { withTimezone: true });

/** A closed value set stored as `text` + `check` (simpler to migrate than a Postgres enum). */
export const enumText = (name: string) => text(name);

export function enumCheck(table: string, column: PgColumn, values: readonly string[]) {
  const list = sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', '));
  return check(`${table}_${column.name}_check`, sql`${column} in (${list})`);
}

/** The tenant id the current transaction runs as, `NULL` outside `withTenant` (so the policy matches nothing). */
const currentCreator: SQL = sql`nullif(current_setting('app.creator_id', true), '')::uuid`;

/** Rows of a table with `creator_id` are visible and writable only inside `withTenant` of that creator. */
export function tenantPolicy(creatorId: PgColumn) {
  return pgPolicy('tenant_isolation', {
    for: 'all',
    using: sql`${creatorId} = ${currentCreator}`,
    withCheck: sql`${creatorId} = ${currentCreator}`,
  });
}

/** Same, plus the rows that belong to nobody (global kill switch). */
export function tenantOrGlobalPolicy(creatorId: PgColumn) {
  return pgPolicy('tenant_isolation', {
    for: 'all',
    using: sql`${creatorId} is null or ${creatorId} = ${currentCreator}`,
    withCheck: sql`${creatorId} is null or ${creatorId} = ${currentCreator}`,
  });
}
