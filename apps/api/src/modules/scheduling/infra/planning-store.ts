import {
  AuditEntryIdSchema,
  CreatorIdSchema,
  newId,
  PlatformAccountIdSchema,
  PlatformSchema,
  SchedulingSettingsSchema,
  ShiftIdSchema,
  ShiftTemplateIdSchema,
  TeamMemberIdSchema,
  TeamMemberStatusSchema,
  type CreatorId,
  type ShiftId,
  type TeamMemberId,
  type UserId,
} from '@nirvana/contracts';
import {
  and,
  enterCreator,
  eq,
  inArray,
  schema,
  sql,
  SNAPSHOT_READ,
  withAdmin,
  withMember,
  withTenantMember,
  type Database,
  type Transaction,
} from '@nirvana/db';
import { z } from 'zod';

import {
  MemberNotFound,
  OwnerOnly,
  PlatformAccountNotFound,
  ShiftAccountConflict,
  ShiftMemberConflict,
  ShiftNotFound,
  ShiftTemplateNotFound,
} from '../domain/errors';
import type {
  Actor,
  PlanningAdmin,
  PlanningStore,
  StoredAccount,
  StoredMember,
  StoredShift,
  StoredTemplate,
} from '../domain/ports';
import {
  assertCanWork,
  assertCancellable,
  assertEndsAhead,
  assertPlans,
  assertShiftRange,
  assertTemplateStart,
  decideUpdate,
  occurrenceKey,
  occurrencesAhead,
} from '../domain/shifts';
import { addDays, calendarDayIn } from '../domain/time';

const { auditLog, platformAccounts, schedulingSettings, shiftTemplates, shifts, teamMembers, user } = schema;

const shiftColumns = {
  id: shifts.id,
  creatorId: shifts.creatorId,
  platformAccountId: shifts.platformAccountId,
  memberId: shifts.memberId,
  startsAt: shifts.startsAt,
  endsAt: shifts.endsAt,
  templateId: shifts.templateId,
  stoppedAt: shifts.stoppedAt,
};

const StoredShiftSchema = z.object({
  id: ShiftIdSchema,
  creatorId: CreatorIdSchema,
  platformAccountId: PlatformAccountIdSchema,
  memberId: TeamMemberIdSchema,
  startsAt: z.date(),
  endsAt: z.date(),
  templateId: ShiftTemplateIdSchema.nullable(),
  stoppedAt: z.date().nullable(),
});

const templateColumns = {
  id: shiftTemplates.id,
  creatorId: shiftTemplates.creatorId,
  platformAccountId: shiftTemplates.platformAccountId,
  memberId: shiftTemplates.memberId,
  weekday: shiftTemplates.weekday,
  startMinute: shiftTemplates.startMinute,
  endMinute: shiftTemplates.endMinute,
  validFrom: shiftTemplates.validFrom,
  validUntil: shiftTemplates.validUntil,
};

const StoredTemplateSchema = z.object({
  id: ShiftTemplateIdSchema,
  creatorId: CreatorIdSchema,
  platformAccountId: PlatformAccountIdSchema,
  memberId: TeamMemberIdSchema,
  weekday: z.number(),
  startMinute: z.number(),
  endMinute: z.number(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
});

const StoredAccountSchema = z.object({
  id: PlatformAccountIdSchema,
  creatorId: CreatorIdSchema,
  platform: PlatformSchema,
  handle: z.string(),
});

const memberColumns = {
  id: teamMembers.id,
  displayName: teamMembers.displayName,
  color: teamMembers.color,
  status: teamMembers.status,
};

const StoredMemberSchema = z.object({
  id: TeamMemberIdSchema,
  displayName: z.string(),
  color: z.string().nullable(),
  status: TeamMemberStatusSchema,
});

const toShift = (row: unknown): StoredShift => StoredShiftSchema.parse(row);
const toTemplate = (row: unknown): StoredTemplate => StoredTemplateSchema.parse(row);
const toMember = (row: unknown): StoredMember => StoredMemberSchema.parse(row);

/** The Postgres code and constraint behind a failed query (Drizzle wraps the driver's error as `cause`). */
function pgErrorOf(error: unknown): { code: string; constraint: string | null } | null {
  for (let current = error; typeof current === 'object' && current !== null;) {
    if ('code' in current && typeof current.code === 'string') {
      const constraint =
        'constraint' in current && typeof current.constraint === 'string' ? current.constraint : null;
      return { code: current.code, constraint };
    }
    current = 'cause' in current ? current.cause : null;
  }
  return null;
}

/** Who did what (append-only, `audit_log`): never a name. */
async function audit(
  tx: Transaction,
  actor: Actor,
  action: string,
  entity: { readonly kind: 'shift' | 'shift_template' | 'scheduling_settings'; readonly id: string },
  details: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(auditLog).values({
    id: newId(AuditEntryIdSchema),
    userId: actor.userId,
    action,
    entity: entity.kind,
    entityId: entity.id,
    details,
    ip: actor.ip,
  });
}

/** A shift goes to an `active` member working on its creator; `member_not_found` when the member does not exist. */
async function assertMemberWorks(
  tx: Transaction,
  memberId: TeamMemberId,
  creatorId: CreatorId,
): Promise<void> {
  const [member] = await tx
    .select({ status: teamMembers.status, creatorIds: user.creatorIds })
    .from(teamMembers)
    .innerJoin(user, eq(user.id, teamMembers.userId))
    .where(eq(teamMembers.id, memberId));
  if (member === undefined) throw new MemberNotFound();
  assertCanWork(
    { status: TeamMemberStatusSchema.parse(member.status), creatorIds: member.creatorIds },
    creatorId,
  );
}

/** The account is the creator's: the tenant policy hides any other. */
async function assertAccountOf(tx: Transaction, platformAccountId: string): Promise<void> {
  const [account] = await tx
    .select({ id: platformAccounts.id })
    .from(platformAccounts)
    .where(eq(platformAccounts.id, platformAccountId));
  if (account === undefined) throw new PlatformAccountNotFound();
}

interface Placed {
  readonly id: string;
  readonly memberId: string;
  readonly platformAccountId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * The write, with an exclusion violation (23P01) turned into the module's conflict and the shift in the way, read on
 * the admin connection: it may be on another creator, which this transaction does not see.
 */
async function placed<T>(adminDb: Database, write: Promise<T>, shift: Placed): Promise<T> {
  try {
    return await write;
  } catch (error) {
    const failure = pgErrorOf(error);
    if (failure?.code !== '23P01') throw error;
    const byMember = failure.constraint === 'shifts_member_overlap_excl';
    const inTheWay = await shiftInTheWayUnscoped(adminDb, shift, byMember ? 'member' : 'account');
    throw byMember ? new ShiftMemberConflict(inTheWay) : new ShiftAccountConflict(inTheWay);
  }
}

async function shiftInTheWayUnscoped(
  adminDb: Database,
  shift: Placed,
  by: 'member' | 'account',
): Promise<string | null> {
  const [row] = await withAdmin(adminDb, (tx) =>
    tx
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          by === 'member'
            ? eq(shifts.memberId, shift.memberId)
            : eq(shifts.platformAccountId, shift.platformAccountId),
          sql`${shifts.cancelledAt} is null`,
          sql`${shifts.id} <> ${shift.id}`,
          sql`tstzrange(${shifts.startsAt}, ${shifts.endsAt}, '[)') && tstzrange(${shift.startsAt}, ${shift.endsAt}, '[)')`,
        ),
      )
      .limit(1),
  );
  return row?.id ?? null;
}

/** The creator of a shift or a template, to enter her with `withTenantMember`; the policies then decide. */
async function creatorOfUnscoped(
  adminDb: Database,
  table: typeof shifts | typeof shiftTemplates,
  id: string,
): Promise<string | null> {
  const [row] = await withAdmin(adminDb, (tx) =>
    tx.select({ creatorId: table.creatorId }).from(table).where(eq(table.id, id)),
  );
  return row?.creatorId ?? null;
}

/**
 * The shifts a template makes ahead, each once: the occurrence key skips those already made, and an occurrence that
 * overlaps another shift of its member or its account is skipped in its own savepoint. The member exclusion is
 * deferrable since 0023 (a swap of two shifts at the same hours), and a deferrable constraint is no arbiter of
 * `ON CONFLICT`: only the occurrence key is.
 */
async function makeShifts(
  tx: Transaction,
  template: StoredTemplate,
  by: string,
  clock: { readonly now: Date; readonly timeZone: string },
): Promise<number> {
  let made = 0;
  for (const occurrence of occurrencesAhead(template, clock.now, clock.timeZone)) {
    try {
      const rows = await tx.transaction((savepoint) =>
        savepoint
          .insert(shifts)
          .values({
            id: newId(ShiftIdSchema),
            creatorId: template.creatorId,
            platformAccountId: template.platformAccountId,
            memberId: template.memberId,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            templateId: template.id,
            templateStartsAt: occurrence.startsAt,
            createdBy: by,
            updatedBy: by,
          })
          .onConflictDoNothing({ target: [shifts.templateId, shifts.templateStartsAt] })
          .returning({ id: shifts.id }),
      );
      made += rows.length;
    } catch (error) {
      if (pgErrorOf(error)?.code !== '23P01') throw error;
    }
  }
  return made;
}

/**
 * The planning's tables through `withMember` and `withTenantMember` (the policies of ADR 0023 decide what each scope
 * reads and writes), plus Better Auth's `user` for a member's creators and `platform_accounts` for the accounts, both
 * read under the same policies. The admin connection is used for what crosses creators only.
 */
export function createDrizzlePlanningStore(db: Database, adminDb: Database): PlanningStore {
  /** The row about to change, locked; `null` when cancelled or out of the actor's sight. */
  const lockShift = async (tx: Transaction, id: ShiftId): Promise<StoredShift | null> => {
    const [row] = await tx
      .select({ ...shiftColumns, cancelledAt: shifts.cancelledAt })
      .from(shifts)
      .where(eq(shifts.id, id))
      .for('update');
    return row?.cancelledAt === null ? toShift(row) : null;
  };

  const inCreatorOf = async <T>(
    table: typeof shifts | typeof shiftTemplates,
    id: string,
    actor: Actor,
    notFound: () => Error,
    fn: (tx: Transaction, creatorId: CreatorId) => Promise<T>,
  ): Promise<T> => {
    const creatorId = await creatorOfUnscoped(adminDb, table, id);
    if (creatorId === null) throw notFound();
    return withTenantMember(db, creatorId, actor.userId, (tx, scope) => {
      assertPlans(scope);
      return fn(tx, CreatorIdSchema.parse(creatorId));
    });
  };

  return {
    settings: (actor) =>
      withMember(db, actor, async (tx) => {
        const [row] = await tx
          .select({
            timeZone: schedulingSettings.timeZone,
            slotStartMinute: schedulingSettings.slotStartMinute,
            slotLengthMinutes: schedulingSettings.slotLengthMinutes,
            accessMarginMinutes: schedulingSettings.accessMarginMinutes,
          })
          .from(schedulingSettings);
        return row === undefined ? null : SchedulingSettingsSchema.parse(row);
      }),

    saveSettings: (actor, settings) =>
      withMember(db, actor.userId, async (tx, scope) => {
        if (scope !== 'owner') throw new OwnerOnly();
        const values = { ...settings, updatedBy: actor.userId, updatedAt: new Date() };
        await tx
          .insert(schedulingSettings)
          .values({ id: 1, ...values })
          .onConflictDoUpdate({ target: schedulingSettings.id, set: values });
        await audit(
          tx,
          actor,
          'scheduling_settings.update',
          { kind: 'scheduling_settings', id: '1' },
          settings,
        );
      }),

    read: (actor, creatorIds, range) =>
      withMember(
        db,
        actor,
        async (tx, scope) => {
          const plans = scope === 'owner' || scope === 'agency';
          const found: {
            shifts: StoredShift[];
            accounts: StoredAccount[];
            templates: StoredTemplate[];
            made: Set<string>;
          } = { shifts: [], accounts: [], templates: [], made: new Set() };
          for (const creatorId of creatorIds) {
            await enterCreator(tx, creatorId);
            const rows = await tx
              .select(shiftColumns)
              .from(shifts)
              .where(
                and(
                  sql`${shifts.cancelledAt} is null`,
                  sql`${shifts.startsAt} < ${range.to}`,
                  sql`${shifts.endsAt} > ${range.from}`,
                ),
              );
            found.shifts.push(...rows.map(toShift));
            const accounts = await tx
              .select({
                id: platformAccounts.id,
                creatorId: platformAccounts.creatorId,
                platform: platformAccounts.platform,
                handle: platformAccounts.handle,
              })
              .from(platformAccounts);
            found.accounts.push(...accounts.map((row) => StoredAccountSchema.parse(row)));
            if (!plans) continue;
            const templates = await tx
              .select(templateColumns)
              .from(shiftTemplates)
              .where(
                sql`${shiftTemplates.validUntil} is null or ${shiftTemplates.validUntil} >= ${addDays(range.from.toISOString().slice(0, 10), -1)}`,
              );
            found.templates.push(...templates.map(toTemplate));
            const made = await tx
              .select({ templateId: shifts.templateId, templateStartsAt: shifts.templateStartsAt })
              .from(shifts)
              .where(
                and(
                  sql`${shifts.templateId} is not null`,
                  sql`${shifts.templateStartsAt} >= ${range.from}`,
                  sql`${shifts.templateStartsAt} < ${range.to}`,
                ),
              );
            for (const row of made) {
              if (row.templateId !== null && row.templateStartsAt !== null) {
                found.made.add(occurrenceKey(row.templateId, row.templateStartsAt));
              }
            }
          }
          const named = [...new Set([...found.shifts, ...found.templates].map((row) => row.memberId))];
          const members =
            named.length === 0
              ? []
              : await tx.select(memberColumns).from(teamMembers).where(inArray(teamMembers.id, named));
          return { scope, ...found, members: members.map(toMember) };
        },
        SNAPSHOT_READ,
      ),

    onDuty: (actor, creatorIds, at) =>
      withMember(
        db,
        actor,
        async (tx, scope) => {
          assertPlans(scope);
          const onDuty: { shift: StoredShift; member: StoredMember }[] = [];
          for (const creatorId of creatorIds) {
            await enterCreator(tx, creatorId);
            const rows = await tx
              .select({ shift: shiftColumns, member: memberColumns })
              .from(shifts)
              .innerJoin(teamMembers, eq(teamMembers.id, shifts.memberId))
              .where(
                and(
                  sql`${shifts.cancelledAt} is null`,
                  sql`${shifts.startsAt} <= ${at}`,
                  sql`${shifts.endsAt} > ${at}`,
                  eq(teamMembers.status, 'active'),
                ),
              );
            onDuty.push(...rows.map((row) => ({ shift: toShift(row.shift), member: toMember(row.member) })));
          }
          return onDuty;
        },
        SNAPSHOT_READ,
      ),

    createShift: (actor, shift, clock) =>
      withTenantMember(db, shift.creatorId, actor.userId, async (tx, scope) => {
        assertPlans(scope);
        assertShiftRange(shift.startsAt, shift.endsAt);
        assertEndsAhead(shift.endsAt, clock.now);
        await assertMemberWorks(tx, shift.memberId, shift.creatorId);
        await assertAccountOf(tx, shift.platformAccountId);
        await placed(
          adminDb,
          tx.insert(shifts).values({ ...shift, createdBy: actor.userId, updatedBy: actor.userId }),
          shift,
        );
        await audit(tx, actor, 'shift.create', { kind: 'shift', id: shift.id });
        return { ...shift, templateId: null, stoppedAt: null };
      }),

    updateShift: (actor, id, change, clock) =>
      inCreatorOf(
        shifts,
        id,
        actor,
        () => new ShiftNotFound(),
        async (tx, creatorId) => {
          const shift = await lockShift(tx, id);
          if (shift === null) throw new ShiftNotFound();
          const update = decideUpdate(shift, change, clock.now);
          const signed = { updatedBy: actor.userId, updatedAt: clock.now };
          const byId = eq(shifts.id, id);
          switch (update.kind) {
            case 'plan': {
              if (update.memberId !== shift.memberId) {
                await assertMemberWorks(tx, TeamMemberIdSchema.parse(update.memberId), creatorId);
              }
              const times = { memberId: update.memberId, startsAt: update.startsAt, endsAt: update.endsAt };
              await placed(
                adminDb,
                tx
                  .update(shifts)
                  .set({ ...times, ...signed })
                  .where(byId),
                {
                  ...shift,
                  ...times,
                },
              );
              break;
            }
            case 'shorten':
              await tx
                .update(shifts)
                .set({ endsAt: update.endsAt, ...signed })
                .where(byId);
              break;
            case 'stop':
              await tx
                .update(shifts)
                .set({ endsAt: update.endsAt, stoppedAt: update.stoppedAt, ...signed })
                .where(byId);
              break;
            case 'cancel':
              await tx
                .update(shifts)
                .set({ cancelledAt: clock.now, ...signed })
                .where(byId);
              break;
          }
          await audit(
            tx,
            actor,
            update.kind === 'cancel' ? 'shift.cancel' : 'shift.update',
            { kind: 'shift', id },
            {
              change: update.kind,
            },
          );
          return update.kind === 'cancel' ? null : lockShift(tx, id);
        },
      ),

    cancelShift: (actor, id, clock) =>
      inCreatorOf(
        shifts,
        id,
        actor,
        () => new ShiftNotFound(),
        async (tx) => {
          const shift = await lockShift(tx, id);
          if (shift === null) throw new ShiftNotFound();
          assertCancellable(shift, clock.now);
          await tx
            .update(shifts)
            .set({ cancelledAt: clock.now, updatedBy: actor.userId, updatedAt: clock.now })
            .where(eq(shifts.id, id));
          await audit(tx, actor, 'shift.cancel', { kind: 'shift', id });
        },
      ),

    templates: (actor, creatorIds, today) =>
      withMember(
        db,
        actor,
        async (tx, scope) => {
          assertPlans(scope);
          const running: StoredTemplate[] = [];
          for (const creatorId of creatorIds) {
            await enterCreator(tx, creatorId);
            const rows = await tx
              .select(templateColumns)
              .from(shiftTemplates)
              .where(sql`${shiftTemplates.validUntil} is null or ${shiftTemplates.validUntil} >= ${today}`);
            running.push(...rows.map(toTemplate));
          }
          return running.toSorted(
            (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.id.localeCompare(b.id),
          );
        },
        SNAPSHOT_READ,
      ),

    createTemplate: (actor, template, clock) =>
      withTenantMember(db, template.creatorId, actor.userId, async (tx, scope) => {
        assertPlans(scope);
        assertTemplateStart(template.validFrom, calendarDayIn(clock.now, clock.timeZone));
        await assertMemberWorks(tx, template.memberId, template.creatorId);
        await assertAccountOf(tx, template.platformAccountId);
        await tx.insert(shiftTemplates).values({ ...template, createdBy: actor.userId });
        const stored = { ...template, validUntil: null };
        const made = await makeShifts(tx, stored, actor.userId, clock);
        await audit(
          tx,
          actor,
          'shift_template.create',
          { kind: 'shift_template', id: template.id },
          { shiftsMade: made },
        );
        return stored;
      }),

    endTemplate: (actor, id, clock) =>
      inCreatorOf(
        shiftTemplates,
        id,
        actor,
        () => new ShiftTemplateNotFound(),
        async (tx) => {
          const [row] = await tx
            .select(templateColumns)
            .from(shiftTemplates)
            .where(eq(shiftTemplates.id, id))
            .for('update');
          // An ended template no longer changes (`shift_templates_kept`): ended once, it is not found again.
          if (row?.validUntil !== null) throw new ShiftTemplateNotFound();
          const today = calendarDayIn(clock.now, clock.timeZone);
          const dayBefore = addDays(row.validFrom, -1);
          // A template that has not started yet ends the day before its first: it never runs.
          await tx
            .update(shiftTemplates)
            .set({ validUntil: today > dayBefore ? today : dayBefore })
            .where(eq(shiftTemplates.id, id));
          const cancelled = await tx
            .update(shifts)
            .set({ cancelledAt: clock.now, updatedBy: actor.userId, updatedAt: clock.now })
            .where(
              and(
                eq(shifts.templateId, id),
                sql`${shifts.cancelledAt} is null`,
                sql`${shifts.startsAt} > ${clock.now}`,
              ),
            )
            .returning({ id: shifts.id });
          await audit(
            tx,
            actor,
            'shift_template.end',
            { kind: 'shift_template', id },
            { shiftsCancelled: cancelled.length },
          );
        },
      ),
  };
}

/** The reads and the job that cross creators, on the admin connection (BYPASSRLS): named `*Unscoped`. */
export function createDrizzlePlanningAdmin(adminDb: Database): PlanningAdmin {
  return {
    memberShiftsUnscoped: (userId: UserId, since: Date) =>
      withAdmin(adminDb, async (tx) => {
        const [member] = await tx
          .select({ id: teamMembers.id, status: teamMembers.status })
          .from(teamMembers)
          .where(eq(teamMembers.userId, userId));
        if (member === undefined) return null;
        const rows = await tx
          .select({
            shift: shiftColumns,
            platform: platformAccounts.platform,
            handle: platformAccounts.handle,
          })
          .from(shifts)
          .innerJoin(platformAccounts, eq(platformAccounts.id, shifts.platformAccountId))
          .where(
            and(
              eq(shifts.memberId, member.id),
              sql`${shifts.cancelledAt} is null`,
              sql`${shifts.endsAt} > ${since}`,
            ),
          );
        return {
          status: TeamMemberStatusSchema.parse(member.status),
          shifts: rows.map((row) => ({
            ...toShift(row.shift),
            platform: PlatformSchema.parse(row.platform),
            handle: row.handle,
          })),
        };
      }),

    onShiftUnscoped: (creatorId, at) =>
      withAdmin(adminDb, async (tx) => {
        const rows = await tx
          .select({
            memberId: shifts.memberId,
            platformAccountId: shifts.platformAccountId,
            shiftId: shifts.id,
            endsAt: shifts.endsAt,
          })
          .from(shifts)
          .innerJoin(teamMembers, eq(teamMembers.id, shifts.memberId))
          .where(
            and(
              eq(shifts.creatorId, creatorId),
              sql`${shifts.cancelledAt} is null`,
              sql`${shifts.startsAt} <= ${at}`,
              sql`${shifts.endsAt} > ${at}`,
              eq(teamMembers.status, 'active'),
            ),
          );
        return rows.map((row) => ({
          memberId: TeamMemberIdSchema.parse(row.memberId),
          platformAccountId: PlatformAccountIdSchema.parse(row.platformAccountId),
          shiftId: ShiftIdSchema.parse(row.shiftId),
          endsAt: row.endsAt,
        }));
      }),

    settingsUnscoped: () =>
      withAdmin(adminDb, async (tx) => {
        const [row] = await tx
          .select({
            timeZone: schedulingSettings.timeZone,
            slotStartMinute: schedulingSettings.slotStartMinute,
            slotLengthMinutes: schedulingSettings.slotLengthMinutes,
            accessMarginMinutes: schedulingSettings.accessMarginMinutes,
          })
          .from(schedulingSettings);
        return row === undefined ? null : SchedulingSettingsSchema.parse(row);
      }),

    runningTemplatesUnscoped: (today) =>
      withAdmin(adminDb, async (tx) => {
        const rows = await tx
          .select({ id: shiftTemplates.id })
          .from(shiftTemplates)
          .where(sql`${shiftTemplates.validUntil} is null or ${shiftTemplates.validUntil} >= ${today}`);
        return rows.map((row) => ShiftTemplateIdSchema.parse(row.id));
      }),

    makeTemplateShiftsUnscoped: (id, clock) =>
      withAdmin(adminDb, async (tx) => {
        // Locked as `endTemplate` locks it: a template ended meanwhile is read ended, and makes nothing past its end.
        const [row] = await tx
          .select({
            template: templateColumns,
            createdBy: shiftTemplates.createdBy,
            status: teamMembers.status,
            creatorIds: user.creatorIds,
          })
          .from(shiftTemplates)
          .innerJoin(teamMembers, eq(teamMembers.id, shiftTemplates.memberId))
          .innerJoin(user, eq(user.id, teamMembers.userId))
          .where(eq(shiftTemplates.id, id))
          .for('update', { of: shiftTemplates });
        if (row === undefined) return 0;
        const template = toTemplate(row.template);
        // A member who left, is away or no longer works on the creator gets no new shift from it.
        if (row.status !== 'active' || !row.creatorIds.includes(template.creatorId)) return 0;
        // An occurrence that overlaps another shift is skipped, not an error (`ON CONFLICT DO NOTHING`).
        return makeShifts(tx, template, row.createdBy, clock);
      }),
  };
}
