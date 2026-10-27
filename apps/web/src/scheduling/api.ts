import {
  ApiErrorSchema,
  MyShiftsSchema,
  OnDutyListSchema,
  PlanningSchema,
  SCHEDULING_ERROR_CODES,
  ShiftSchema,
  ShiftTemplateListSchema,
  ShiftTemplateSchema,
  type CreateShiftBody,
  type CreateShiftTemplateBody,
  type MyShifts,
  type OnDuty,
  type Planning,
  type SchedulingErrorCode,
  type Shift,
  type ShiftTemplate,
  type UpdateShiftBody,
} from '@nirvana/contracts';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { z } from 'zod';

/**
 * `/v1/scheduling` as the screens read it (EQ-02): the planning of a week, who is on shift, the member's own shifts,
 * and the writes of the owner and an active manager. Every answer is parsed with the contract.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

async function read<T>(url: string, parse: (body: unknown) => T): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`GET ${url}: ${String(response.status)}`);
  return parse(await response.json());
}

export interface PlanningRange {
  readonly from: string;
  readonly to: string;
  readonly creatorId: string | null;
}

export function fetchPlanning(range: PlanningRange): Promise<Planning> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  if (range.creatorId !== null) query.set('creatorId', range.creatorId);
  return read(`/v1/scheduling/planning?${query.toString()}`, (body) => PlanningSchema.parse(body));
}

/** Everything the planning shows, read again by every write. */
export const SCHEDULING_KEY = ['scheduling'] as const;

export function usePlanning(range: PlanningRange): UseQueryResult<Planning> {
  return useQuery({
    queryKey: [...SCHEDULING_KEY, 'planning', range.from, range.to, range.creatorId],
    queryFn: () => fetchPlanning(range),
    // The week stays on screen while the next one loads: no blank grid between two weeks.
    placeholderData: (before) => before,
  });
}

/** Who is on shift right now: read again every minute, a shift starts or ends on the minute. */
export function useOnDuty(enabled: boolean): UseQueryResult<OnDuty[]> {
  return useQuery({
    queryKey: [...SCHEDULING_KEY, 'on-duty'],
    queryFn: () => read('/v1/scheduling/on-duty', (body) => OnDutyListSchema.parse(body).onDuty),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useTemplates(enabled: boolean): UseQueryResult<ShiftTemplate[]> {
  return useQuery({
    queryKey: [...SCHEDULING_KEY, 'templates'],
    queryFn: () =>
      read('/v1/scheduling/shift-templates', (body) => ShiftTemplateListSchema.parse(body).templates),
    enabled,
  });
}

/** The member's shift now, the next one and the one whose margin is still open (Aujourd'hui, Suivi). */
export function useMyShifts(): UseQueryResult<MyShifts> {
  return useQuery({
    queryKey: [...SCHEDULING_KEY, 'mine'],
    queryFn: () => read('/v1/scheduling/my-shifts', (body) => MyShiftsSchema.parse(body)),
    refetchInterval: 60_000,
  });
}

/** A refusal the screen words, or a server that does not answer. */
export type Refusal =
  | { readonly kind: 'refused'; readonly code: SchedulingRefusalCode; readonly shiftId: string | null }
  | { readonly kind: 'failed' };

export type SchedulingRefusalCode = SchedulingErrorCode | 'role_forbidden';

export type Outcome<T> = { readonly kind: 'ok'; readonly value: T } | Refusal;

const isSchedulingCode = (code: string): code is SchedulingErrorCode =>
  SCHEDULING_ERROR_CODES.some((known) => known === code);

const InTheWaySchema = z.object({ shiftId: z.string() });

async function refusalOf(response: Response): Promise<Refusal> {
  const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { kind: 'failed' };
  const { code, details } = parsed.data.error;
  // The 409s of a member or an account already taken name the shift in the way.
  const inTheWay = InTheWaySchema.safeParse(details);
  const shiftId = inTheWay.success ? inTheWay.data.shiftId : null;
  // A manager whose status changed since the page opened: the role guard, not a server down.
  if (code === 'role_forbidden') return { kind: 'refused', code, shiftId };
  return isSchedulingCode(code) ? { kind: 'refused', code, shiftId } : { kind: 'failed' };
}

async function send<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown,
  parse: (json: unknown) => T,
): Promise<Outcome<T>> {
  try {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      ...(body === undefined ? {} : { headers: JSON_HEADERS, body: JSON.stringify(body) }),
    });
    if (!response.ok) return await refusalOf(response);
    return { kind: 'ok', value: parse(response.status === 204 ? null : await response.json()) };
  } catch {
    return { kind: 'failed' };
  }
}

export const createShift = (body: CreateShiftBody): Promise<Outcome<Shift>> =>
  send('POST', '/v1/scheduling/shifts', body, (json) => ShiftSchema.parse(json));

export const updateShift = (shiftId: string, body: UpdateShiftBody): Promise<Outcome<Shift>> =>
  send('PATCH', `/v1/scheduling/shifts/${shiftId}`, body, (json) => ShiftSchema.parse(json));

export const cancelShift = (shiftId: string): Promise<Outcome<null>> =>
  send('DELETE', `/v1/scheduling/shifts/${shiftId}`, undefined, () => null);

export const createTemplate = (body: CreateShiftTemplateBody): Promise<Outcome<ShiftTemplate>> =>
  send('POST', '/v1/scheduling/shift-templates', body, (json) => ShiftTemplateSchema.parse(json));

export const endTemplate = (templateId: string): Promise<Outcome<null>> =>
  send('DELETE', `/v1/scheduling/shift-templates/${templateId}`, undefined, () => null);

/** After a write: the week, who is on shift and the templates are read again together. */
export function useRefreshPlanning(): () => Promise<void> {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: SCHEDULING_KEY }), [client]);
}
