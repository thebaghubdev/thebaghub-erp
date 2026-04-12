import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserType } from '../enums/user-type.enum';
import { JwtUser } from './jwt-user';

type JwtPayload = {
  sub: string;
  username: string;
  userType: UserType;
  isAdmin: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-insecure-change-me'),
    });
  }

  validate(payload: JwtPayload): JwtUser {
    return {
      userId: payload.sub,
      username: payload.username,
      userType: payload.userType,
      isAdmin: payload.isAdmin,
    };
  }
}
