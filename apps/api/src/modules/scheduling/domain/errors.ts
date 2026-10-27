import { DomainError } from '@nirvana/contracts';

/** Error codes of the module (`SCHEDULING_ERROR_CODES`, api.md § Erreurs): the suffix gives the HTTP status. */
export class ShiftNotFound extends DomainError {
  constructor() {
    super('shift_not_found', 'Shift introuvable');
  }
}

export class ShiftTemplateNotFound extends DomainError {
  constructor() {
    super('shift_template_not_found', 'Modèle de shift introuvable');
  }
}

export class MemberNotFound extends DomainError {
  constructor() {
    super('member_not_found', 'Membre introuvable');
  }
}

export class CreatorNotFound extends DomainError {
  constructor() {
    super('creator_not_found', 'Créatrice introuvable');
  }
}

export class PlatformAccountNotFound extends DomainError {
  constructor() {
    super('platform_account_not_found', 'Ce compte n’est pas un compte de cette créatrice');
  }
}

export class MemberNotActive extends DomainError {
  constructor() {
    super('member_left_conflict', 'Ce membre n’est pas actif : il ne reçoit pas de shift');
  }
}

export class MemberCreatorConflict extends DomainError {
  constructor() {
    super('member_creator_conflict', 'Ce membre ne travaille pas sur cette créatrice');
  }
}

export class ShiftMemberConflict extends DomainError {
  constructor(shiftId: string | null) {
    super('shift_member_conflict', 'Ce membre a déjà un shift à ce moment-là', {
      details: shiftId === null ? {} : { shiftId },
    });
  }
}

export class ShiftAccountConflict extends DomainError {
  constructor(shiftId: string | null) {
    super('shift_account_conflict', 'Ce compte a déjà un membre à ce moment-là', {
      details: shiftId === null ? {} : { shiftId },
    });
  }
}

export class ShiftEnded extends DomainError {
  constructor() {
    super('shift_ended_conflict', 'Ce shift est fini : il ne change plus');
  }
}

export class ShiftStarted extends DomainError {
  constructor() {
    super(
      'shift_started_conflict',
      'Ce shift a commencé : on peut seulement le finir plus tôt, l’arrêter ou l’annuler',
    );
  }
}

export class ShiftRangeInvalid extends DomainError {
  constructor() {
    super(
      'shift_range_invalid',
      'Un shift commence et finit à la minute pile, finit après son début et dure 24 heures au plus',
    );
  }
}

export class PlanningRangeInvalid extends DomainError {
  constructor() {
    super('planning_range_invalid', 'La période lue finit après son début et dure six semaines au plus');
  }
}

/** The range of a leaves read (`LEAVE_QUERY_MAX_DAYS`). */
export class LeaveRangeInvalid extends DomainError {
  constructor() {
    super('planning_range_invalid', 'La période lue finit après son début et dure un an au plus');
  }
}

export class ShiftTemplateDateInvalid extends DomainError {
  constructor() {
    super('shift_template_date_invalid', 'Un modèle commence aujourd’hui au plus tôt');
  }
}

/** Planning is the owner's and the active managers' (ADR 0024). */
export class PlanningForbidden extends DomainError {
  constructor() {
    super('role_forbidden', 'Seuls le propriétaire et les managers actifs planifient');
  }
}

/** The settings are the owner's alone. */
export class OwnerOnly extends DomainError {
  constructor() {
    super('role_forbidden', 'Seul le propriétaire règle le planning');
  }
}

/** No shift on a member during their approved leave (ADR 0031). */
export class MemberOnLeave extends DomainError {
  constructor(leaveRequestId: string) {
    super('member_on_leave_conflict', 'Ce membre est en congé à ce moment-là', {
      details: { leaveRequestId },
    });
  }
}

export class LeaveRequestNotFound extends DomainError {
  constructor() {
    super('leave_request_not_found', 'Demande de congé introuvable');
  }
}

/** The same `id` was recorded with other values. */
export class LeaveRequestConflict extends DomainError {
  constructor() {
    super('leave_request_conflict', 'Cette demande de congé existe déjà avec d’autres valeurs');
  }
}

export class LeaveOverlap extends DomainError {
  constructor(leaveRequestId: string | null) {
    super(
      'leave_overlap_conflict',
      'Un autre congé en attente ou validé couvre déjà une partie de ces jours',
      {
        details: leaveRequestId === null ? {} : { leaveRequestId },
      },
    );
  }
}

export class LeaveDecided extends DomainError {
  constructor() {
    super('leave_decided_conflict', 'Cette demande de congé a déjà sa réponse, ou ce congé est fini');
  }
}

/** Approving while shifts of the member still cover the leave: they go to someone else first. */
export class LeaveShifts extends DomainError {
  constructor(shiftIds: readonly string[]) {
    super('leave_shifts_conflict', 'Des shifts du membre tombent encore pendant ce congé', {
      details: { shiftIds: [...shiftIds] },
    });
  }
}

export class LeaveOwnDecision extends DomainError {
  constructor() {
    super('leave_own_decision_forbidden', 'Un manager ne décide pas de son propre congé');
  }
}

export class LeaveDateInvalid extends DomainError {
  constructor() {
    super('leave_date_invalid', 'Un congé commence aujourd’hui au plus tôt');
  }
}

/** A pending request of someone else is refused, never withdrawn by the agency. */
export class LeaveNotWithdrawable extends DomainError {
  constructor() {
    super('role_forbidden', 'Une demande en attente se refuse : seul son membre la retire');
  }
}

export class ShiftSwapNotFound extends DomainError {
  constructor() {
    super('shift_swap_not_found', 'Échange introuvable');
  }
}

/** The same `id` was recorded with other values. */
export class ShiftSwapConflict extends DomainError {
  constructor() {
    super('shift_swap_conflict', 'Cet échange existe déjà avec d’autres valeurs');
  }
}

export class ShiftSwapOpen extends DomainError {
  constructor(shiftSwapRequestId: string | null) {
    super('shift_swap_open_conflict', 'Cette proposition attend déjà sa réponse', {
      details: shiftSwapRequestId === null ? {} : { shiftSwapRequestId },
    });
  }
}

export class ShiftSwapAnswered extends DomainError {
  constructor() {
    super('shift_swap_answered_conflict', 'Cet échange n’est plus proposé');
  }
}

export class ShiftSwapLapsed extends DomainError {
  constructor() {
    super(
      'shift_swap_lapsed_conflict',
      'Cet échange ne tient plus : un des shifts a commencé, a été annulé, ou a changé de mains ou d’heures',
    );
  }
}

export class ShiftSwapRevert extends DomainError {
  constructor() {
    super(
      'shift_swap_revert_conflict',
      'Cet échange ne revient plus en arrière : un des shifts a commencé, ou a changé de mains ou d’heures',
    );
  }
}

export class ShiftSwapSelf extends DomainError {
  constructor() {
    super('shift_swap_self_invalid', 'Un échange se fait avec un collègue');
  }
}

/** Only the colleague asked answers a swap; only its requester or the agency withdraws it. */
export class ShiftSwapNotYours extends DomainError {
  constructor() {
    super(
      'role_forbidden',
      'Seul le collègue sollicité répond à un échange, et il ne le retire pas : il le refuse',
    );
  }
}
