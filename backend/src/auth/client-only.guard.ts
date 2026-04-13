import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserType } from '../enums/user-type.enum';
import { JwtUser } from './jwt-user';

@Injectable()
export class ClientOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = req.user;
    if (!user || user.userType !== UserType.CLIENT) {
      throw new ForbiddenException('Clients only');
    }
    return true;
  }
}
