import {
  CommissionPresetIdSchema,
  CommissionRateIdSchema,
  newId,
  TeamMemberIdSchema,
  TeamMemberNoteIdSchema,
  UserIdSchema,
  type CommissionPreset,
  type CommissionRate,
  type CreateCommissionPresetBody,
  type CreateTeamMemberBody,
  type CreatorId,
  type SetCommissionRateBody,
  type TeamMember,
  type TeamMemberId,
  type TeamMemberNote,
  type TeamMemberStatus,
  type UpdateTeamMemberBody,
  type UserId,
} from '@nirvana/contracts';

import { CommissionPresetNotFound, MemberNotFound } from '../domain/errors';
import {
  assertCreatorsExist,
  assertStartsFromToday,
  calendarDayIn,
  normalizeEmail,
  presetsInForce,
  uniqueCreatorIds,
} from '../domain/members';
import type { Actor, CreatorRoster, InvitationLinkDirectory, NewRate, TeamStore } from '../domain/ports';

/** Équipe › Membres (EQ-01): reads for the owner and the managers, writes for the owner. */
export interface TeamService {
  members(actor: UserId): Promise<TeamMember[]>;
  member(actor: UserId, id: TeamMemberId): Promise<TeamMember>;
  addMember(actor: Actor, body: CreateTeamMemberBody): Promise<TeamMember>;
  updateMember(actor: Actor, id: TeamMemberId, body: UpdateTeamMemberBody): Promise<TeamMember>;
  changeStatus(actor: Actor, id: TeamMemberId, status: TeamMemberStatus): Promise<TeamMember>;
  setCommission(actor: Actor, id: TeamMemberId, body: SetCommissionRateBody): Promise<CommissionRate>;
  commissionHistory(actor: UserId, id: TeamMemberId): Promise<CommissionRate[]>;
  /** The presets in force today, one per name. */
  presets(actor: UserId): Promise<CommissionPreset[]>;
  addPreset(actor: Actor, body: CreateCommissionPresetBody): Promise<CommissionPreset>;
  notes(actor: UserId, id: TeamMemberId): Promise<TeamMemberNote[]>;
  addNote(actor: Actor, id: TeamMemberId, body: string): Promise<TeamMemberNote>;
}

export interface TeamServiceOptions {
  /** The agency's time zone, where « today » is read (ADR 0023 § Paie; a setting of its own later). */
  readonly agencyTimeZone: string;
  readonly now?: () => Date;
}

export function createTeamService(
  store: TeamStore,
  roster: CreatorRoster,
  links: InvitationLinkDirectory,
  options: TeamServiceOptions,
): TeamService {
  const now = options.now ?? (() => new Date());
  const today = (): string => calendarDayIn(now(), options.agencyTimeZone);

  /**
   * When each member's invitation stops working (« Lien valable jusqu'à… », « Lien expiré »); `null` with none out. A
   * link for a new password is not an invitation: the record does not show it.
   */
  const withLinks = async (members: TeamMember[]): Promise<TeamMember[]> => {
    if (members.length === 0) return members;
    const live = await links.live(members.map((member) => member.id));
    return members.map((member) => {
      const link = live.get(member.id);
      return {
        ...member,
        invitationExpiresAt: link?.purpose === 'invitation' ? link.expiresAt.toISOString() : null,
      };
    });
  };

  const read = async (actor: UserId, id: TeamMemberId): Promise<TeamMember> => {
    const member = await store.member(actor, id, today());
    if (member === null) throw new MemberNotFound();
    const [withLink] = await withLinks([member]);
    return withLink ?? member;
  };

  const knownCreators = async (ids: readonly CreatorId[]): Promise<CreatorId[]> => {
    const unique = uniqueCreatorIds(ids);
    if (unique.length > 0) assertCreatorsExist(unique, await roster.existing(unique));
    return unique;
  };

  /** A preset becomes its rate of that row; a rate typed by hand stays as it is. */
  const resolveRate = async (
    actor: UserId,
    choice: CreateTeamMemberBody['commission'],
    teamShareBps: number | null,
    effectiveFrom: string,
  ): Promise<NewRate> => {
    const id = newId(CommissionRateIdSchema);
    if ('rateBps' in choice) {
      return { id, rateBps: choice.rateBps, teamShareBps, presetId: null, effectiveFrom };
    }
    const preset = (await store.presets(actor)).find((row) => row.id === choice.presetId);
    if (preset === undefined) throw new CommissionPresetNotFound();
    return { id, rateBps: preset.rateBps, teamShareBps, presetId: preset.id, effectiveFrom };
  };

  return {
    members: async (actor) => withLinks(await store.members(actor, today())),
    member: read,

    addMember: async (actor, body) => {
      const creatorIds = await knownCreators(body.creatorIds);
      const id = newId(TeamMemberIdSchema);
      await store.create(actor, {
        id,
        userId: newId(UserIdSchema),
        email: normalizeEmail(body.email),
        firstName: body.firstName,
        lastName: body.lastName,
        displayName: body.displayName,
        teamRole: body.teamRole,
        country: body.country,
        timeZone: body.timeZone,
        color: body.color,
        joinedOn: body.joinedOn,
        creatorIds,
        // The first rate starts the day he joins: no day of his was worked before it.
        rate: await resolveRate(actor.userId, body.commission, body.teamShareBps, body.joinedOn),
      });
      return read(actor.userId, id);
    },

    updateMember: async (actor, id, body) => {
      const { creatorIds, ...fields } = body;
      await store.update(actor, id, {
        ...fields,
        ...(creatorIds !== undefined && { creatorIds: await knownCreators(creatorIds) }),
      });
      return read(actor.userId, id);
    },

    changeStatus: async (actor, id, status) => {
      await store.changeStatus(actor, id, status);
      return read(actor.userId, id);
    },

    setCommission: async (actor, id, body) => {
      assertStartsFromToday(body.effectiveFrom, today());
      return store.addRate(
        actor,
        id,
        await resolveRate(actor.userId, body.commission, body.teamShareBps, body.effectiveFrom),
      );
    },

    commissionHistory: async (actor, id) => {
      const rates = await store.rates(actor, id);
      if (rates === null) throw new MemberNotFound();
      return rates;
    },

    presets: async (actor) => presetsInForce(await store.presets(actor), today()),

    addPreset: (actor, body) => {
      assertStartsFromToday(body.effectiveFrom, today());
      return store.addPreset(actor, { id: newId(CommissionPresetIdSchema), ...body });
    },

    notes: async (actor, id) => {
      const notes = await store.notes(actor, id);
      if (notes === null) throw new MemberNotFound();
      return notes;
    },

    addNote: (actor, id, body) => store.addNote(actor, id, { id: newId(TeamMemberNoteIdSchema), body }),
  };
}
