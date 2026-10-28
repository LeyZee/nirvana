import type {
  AlertsView,
  CreateCustomAlertBody,
  CreatorId,
  CustomAlert,
  CustomAlertBody,
  CustomAlertGroup,
  CustomAlertGroupId,
  SetSystemAlertBody,
  SystemAlertCode,
  SystemAlertSetting,
} from '@nirvana/contracts';

/**
 * Her alerts (P4-01), one row per creator under RLS. The store crosses creators for the owner, one creator at a time
 * inside one transaction; it reads `creators` first so that it never opens a creator that does not exist.
 */
export interface AlertStore {
  /** Réglages › Alertes: her own alerts not archived, gathered by group, and the system's on each creator. */
  view(): Promise<AlertsView>;
  /**
   * Writes a new alert on each of its creators under the client's group id, audited with the owner. The same alert
   * sent again gives what is stored (`replayed`); the same id with other values, or archived, is a `conflict`.
   */
  create(
    body: CreateCustomAlertBody,
    userId: string,
  ): Promise<
    | { readonly kind: 'created' | 'replayed'; readonly alert: CustomAlertGroup }
    | { readonly kind: 'unknown_creator' }
    | { readonly kind: 'conflict' }
  >;
  /**
   * Replaces the alert on all its creators: the rows kept are updated, the creators added get one (a creator removed
   * then added back gets her row again), the creators left out are archived. `not_found` when the group has no row
   * that is not archived.
   */
  replace(
    groupId: CustomAlertGroupId,
    body: CustomAlertBody,
    userId: string,
  ): Promise<CustomAlertGroup | 'unknown_creator' | 'not_found'>;
  /** Archives every row of the alert, never deletes: the history keeps its name. `false` when none was left. */
  archive(groupId: CustomAlertGroupId, userId: string): Promise<boolean>;
  /** Switches a system alert on or off for the creators named; `keyword` is `locked`. */
  setSystem(
    code: SystemAlertCode,
    body: SetSystemAlertBody,
    userId: string,
  ): Promise<SystemAlertSetting | 'unknown_creator' | 'locked'>;
  /** Her own alerts that are on (enabled, not archived): what the agent checks each of his messages against. */
  activeFor(creatorId: CreatorId): Promise<readonly CustomAlert[]>;
  /** The system's alerts that are on for her. */
  systemOn(creatorId: CreatorId): Promise<ReadonlySet<SystemAlertCode>>;
}
