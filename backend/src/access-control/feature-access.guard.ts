import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtUser } from '../auth/jwt-user';
import { FeatureAccessService } from './feature-access.service';
import {
  REQUIRE_FEATURE_KEY,
  RequireFeatureMeta,
} from './require-feature.decorator';

@Injectable()
export class FeatureAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureAccessService: FeatureAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequireFeatureMeta | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException();
    }

    await this.featureAccessService.assertAccess(
      user.userId,
      user.isAdmin,
      meta.featureKey,
      meta.level,
      meta.orFeatureKeys ?? [],
    );
    return true;
  }
}
