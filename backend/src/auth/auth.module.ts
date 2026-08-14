import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { MailModule } from '../mail/mail.module';
import { User } from '../users/entities/user.entity';
import { AdminGuard } from './admin.guard';
import { ClientOnlyGuard } from './client-only.guard';
import { StaffOnlyGuard } from './staff-only.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [
    MailModule,
    forwardRef(() => AccessControlModule),
    TypeOrmModule.forFeature([User, Employee, Client]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-insecure-change-me'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TurnstileService,
    JwtStrategy,
    AdminGuard,
    StaffOnlyGuard,
    ClientOnlyGuard,
  ],
  exports: [AuthService, ClientOnlyGuard, JwtModule, StaffOnlyGuard],
})
export class AuthModule {}
