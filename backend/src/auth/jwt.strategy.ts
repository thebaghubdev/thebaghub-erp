import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { UserType } from '../enums/user-type.enum';
import { User } from '../users/entities/user.entity';
import { JwtUser } from './jwt-user';

type JwtPayload = {
  sub: string;
  username: string;
  userType: UserType;
  isAdmin: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-insecure-change-me'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.userType === UserType.CLIENT && !user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Please verify your email before continuing. Sign out and complete verification from your inbox, or use “Resend link” on the sign-in page.',
      );
    }
    return {
      userId: user.id,
      username: user.username,
      userType: user.userType,
      isAdmin: user.isAdmin,
    };
  }
}
