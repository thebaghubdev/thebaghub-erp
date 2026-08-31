import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import {
  CEO_POSITION,
  CONSIGNMENT_COORDINATOR_POSITION,
  GENERAL_MANAGER_POSITION,
} from '../notifications/notification.constants';

export { CEO_POSITION, CONSIGNMENT_COORDINATOR_POSITION, GENERAL_MANAGER_POSITION };

export const CEO_POSITION_TAKEN_MESSAGE =
  'A CEO is already registered. Only one employee can have the CEO position.';

export const GENERAL_MANAGER_POSITION_TAKEN_MESSAGE =
  'A General Manager is already registered. Only one employee can have the General Manager position.';

export function isCeoPosition(position: string | null | undefined): boolean {
  return (position ?? '').trim().toLowerCase() === CEO_POSITION.toLowerCase();
}

export function isConsignmentCoordinatorPosition(
  position: string | null | undefined,
): boolean {
  return (
    (position ?? '').trim().toLowerCase() ===
    CONSIGNMENT_COORDINATOR_POSITION.toLowerCase()
  );
}

export function isGeneralManagerPosition(
  position: string | null | undefined,
): boolean {
  return (
    (position ?? '').trim().toLowerCase() ===
    GENERAL_MANAGER_POSITION.toLowerCase()
  );
}

export function isSupervisorPosition(
  position: string | null | undefined,
): boolean {
  return (position ?? '').trim().toLowerCase() === 'supervisor';
}

export function isPhotographerPosition(
  position: string | null | undefined,
): boolean {
  return (position ?? '').trim().toLowerCase() === 'photographer';
}

/** Supervisors (and admins) may assign authentication to other staff. */
export function canAssignWorkToOthers(
  isAdmin: boolean,
  position: string | null | undefined,
): boolean {
  return isAdmin || isSupervisorPosition(position);
}

async function countEmployeesWithPosition(
  repo: Repository<Employee>,
  position: string,
  exceptEmployeeId?: string,
): Promise<number> {
  const qb = repo
    .createQueryBuilder('e')
    .where('LOWER(TRIM(e.position)) = :pos', {
      pos: position.trim().toLowerCase(),
    });
  if (exceptEmployeeId) {
    qb.andWhere('e.id != :id', { id: exceptEmployeeId });
  }
  return qb.getCount();
}

export async function countCeoEmployees(
  repo: Repository<Employee>,
  exceptEmployeeId?: string,
): Promise<number> {
  return countEmployeesWithPosition(repo, CEO_POSITION, exceptEmployeeId);
}

export async function countGeneralManagerEmployees(
  repo: Repository<Employee>,
  exceptEmployeeId?: string,
): Promise<number> {
  return countEmployeesWithPosition(
    repo,
    GENERAL_MANAGER_POSITION,
    exceptEmployeeId,
  );
}
