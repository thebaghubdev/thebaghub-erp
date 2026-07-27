export function isSalesAssociatePosition(position: string): boolean {
  return position.trim().toLowerCase() === "sales associate";
}

export function isSalesAdminPosition(position: string): boolean {
  return position.trim().toLowerCase() === "sales admin";
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
