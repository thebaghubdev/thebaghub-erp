import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CEO_POSITION } from '../notifications/notification.constants';

export { CEO_POSITION };

export const CEO_POSITION_TAKEN_MESSAGE =
  'A CEO is already registered. Only one employee can have the CEO position.';

export function isCeoPosition(position: string | null | undefined): boolean {
  return (position ?? '').trim().toLowerCase() === CEO_POSITION.toLowerCase();
}

export function isSupervisorPosition(
  position: string | null | undefined,
): boolean {
  return (position ?? '').trim().toLowerCase() === 'supervisor';
}

/** Supervisors (and admins) may assign authentication/orders to other staff. */
export function canAssignWorkToOthers(
  isAdmin: boolean,
  position: string | null | undefined,
): boolean {
  return isAdmin || isSupervisorPosition(position);
}

export async function countCeoEmployees(
  repo: Repository<Employee>,
  exceptEmployeeId?: string,
): Promise<number> {
  const qb = repo
    .createQueryBuilder('e')
    .where('LOWER(TRIM(e.position)) = :pos', {
      pos: CEO_POSITION.toLowerCase(),
    });
  if (exceptEmployeeId) {
    qb.andWhere('e.id != :id', { id: exceptEmployeeId });
  }
  return qb.getCount();
}
