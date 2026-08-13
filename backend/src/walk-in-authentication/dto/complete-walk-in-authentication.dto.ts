import { IsIn } from 'class-validator';
import { WALK_IN_AUTH_RESULTS } from '../walk-in-authentication.constants';

export class CompleteWalkInAuthenticationDto {
  @IsIn([...WALK_IN_AUTH_RESULTS])
  result: string;
}
