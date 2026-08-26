export function isSalesAssociatePosition(position: string): boolean {
  return position.trim().toLowerCase() === "sales associate";
}

export function isSalesAdminPosition(position: string): boolean {
  return position.trim().toLowerCase() === "sales admin";
}

export function isCeoPosition(position: string | null | undefined): boolean {
  return (position ?? "").trim().toLowerCase() === "ceo";
}

export function isConsignmentCoordinatorPosition(
  position: string | null | undefined,
): boolean {
  return (position ?? "").trim().toLowerCase() === "consignment coordinator";
}

export function isGeneralManagerPosition(
  position: string | null | undefined,
): boolean {
  return (position ?? "").trim().toLowerCase() === "general manager";
}

export function isSupervisorPosition(
  position: string | null | undefined,
): boolean {
  return (position ?? "").trim().toLowerCase() === "supervisor";
}

export function isPhotographerPosition(
  position: string | null | undefined,
): boolean {
  return (position ?? "").trim().toLowerCase() === "photographer";
}

/** Supervisors (and admins) may assign authentication/orders to other staff. */
export function canAssignWorkToOthers(
  isAdmin: boolean,
  position: string | undefined,
): boolean {
  if (isAdmin) return true;
  return position != null && isSupervisorPosition(position);
}

export function canBypassOrderAssignment(
  isAdmin: boolean,
  position: string | undefined,
): boolean {
  if (isAdmin) return true;
  return position != null && isSalesAdminPosition(position);
}

export function canCreateStaffOrder(
  isAdmin: boolean,
  position: string | undefined,
): boolean {
  if (isAdmin) return true;
  return position != null && isSalesAssociatePosition(position);
}
