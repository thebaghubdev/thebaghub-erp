import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserType } from '../enums/user-type.enum';
import { JwtUser } from './jwt-user';

/** Rejects JWTs for client users — staff/ERP API routes only. */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException();
    }
    if (user.userType === UserType.CLIENT) {
      throw new ForbiddenException('Client accounts cannot access this resource');
    }
    return true;
  }
}
