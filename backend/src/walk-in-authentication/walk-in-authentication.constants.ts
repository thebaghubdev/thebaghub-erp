export const WALK_IN_AUTH_STATUS_PENDING = 'Pending';
export const WALK_IN_AUTH_STATUS_ASSIGNED = 'Assigned';
export const WALK_IN_AUTH_STATUS_COMPLETED = 'Completed';

export const WALK_IN_AUTH_RESULT_AUTHENTIC = 'Authentic';
export const WALK_IN_AUTH_RESULT_NOT_AUTHENTIC = 'Not authentic';
export const WALK_IN_AUTH_RESULT_INCONCLUSIVE = 'Inconclusive';

export const WALK_IN_AUTH_RESULTS = [
  WALK_IN_AUTH_RESULT_AUTHENTIC,
  WALK_IN_AUTH_RESULT_NOT_AUTHENTIC,
  WALK_IN_AUTH_RESULT_INCONCLUSIVE,
] as const;

export type WalkInAuthResult = (typeof WALK_IN_AUTH_RESULTS)[number];

export const WALK_IN_AUTH_BRANCHES = ['Pasig', 'Makati'] as const;
export type WalkInAuthBranch = (typeof WALK_IN_AUTH_BRANCHES)[number];
