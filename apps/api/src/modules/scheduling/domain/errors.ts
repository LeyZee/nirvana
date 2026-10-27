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
