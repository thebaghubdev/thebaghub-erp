import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { UserType } from '../enums/user-type.enum';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { ResendClientVerificationDto } from './dto/resend-client-verification.dto';
import { VerifyClientEmailDto } from './dto/verify-client-email.dto';
import { JwtUser } from './jwt-user';
import { TurnstileService } from './turnstile.service';

const CLIENT_VERIFICATION_HOURS = 48;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly turnstile: TurnstileService,
    private readonly mail: MailService,
  ) {}

  async registerClient(dto: RegisterClientDto) {
    const turnstileSecret = this.config
      .get<string>('TURNSTILE_SECRET_KEY', '')
      ?.trim();
    if (turnstileSecret) {
      const token = dto.turnstileToken?.trim();
      if (!token) {
        throw new BadRequestException('Captcha verification is required');
      }
      const ok = await this.turnstile.verifyToken(token, turnstileSecret);
      if (!ok) {
        throw new BadRequestException('Captcha verification failed');
      }
    }

    const username = dto.email.trim().toLowerCase();
    const existing = await this.usersRepo.findOne({ where: { username } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const mailConfigured = this.mail.isConfigured();
    if (!mailConfigured) {
      this.logger.warn(
        'MAIL_* is not set: new client accounts are treated as email-verified without sending mail.',
      );
    }
    const verificationToken = mailConfigured
      ? crypto.randomBytes(32).toString('hex')
      : null;
    const verificationExpires = mailConfigured ? new Date() : null;
    if (verificationExpires) {
      verificationExpires.setHours(
        verificationExpires.getHours() + CLIENT_VERIFICATION_HOURS,
      );
    }
    const emailVerifiedAt = mailConfigured ? null : new Date();

    await this.usersRepo.manager.transaction(async (em) => {
      const user = em.create(User, {
        username,
        passwordHash,
        userType: UserType.CLIENT,
        isAdmin: false,
        emailVerifiedAt,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpires,
        createdById: null,
        updatedById: null,
      });
      await em.save(user);
      const client = em.create(Client, {
        userId: user.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email.trim().toLowerCase(),
        contactNumber: dto.contactNumber.trim(),
        createdById: null,
        updatedById: null,
      });
      await em.save(client);
    });

    const created = await this.usersRepo.findOneOrFail({ where: { username } });
    const clientRow = await this.clientsRepo.findOneOrFail({
      where: { userId: created.id },
    });

    let verificationEmailSent = false;
    if (mailConfigured && verificationToken) {
      const origin = this.config
        .get<string>('FRONTEND_ORIGIN', 'http://localhost:5173')
        .replace(/\/$/, '');
      const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(verificationToken)}`;
      try {
        await this.mail.sendClientEmailVerification({
          to: dto.email.trim(),
          firstName: dto.firstName.trim(),
          verifyUrl,
        });
        verificationEmailSent = true;
      } catch (err) {
        this.logger.error('Failed to send verification email', err);
      }
    }

    return {
      id: created.id,
      username: created.username,
      userType: created.userType,
      emailVerificationPending: mailConfigured,
      verificationEmailSent,
      client: {
        id: clientRow.id,
        firstName: clientRow.firstName,
        lastName: clientRow.lastName,
        email: clientRow.email,
      },
    };
  }

  async verifyClientEmail(dto: VerifyClientEmailDto) {
    const token = dto.token.trim();
    const user = await this.usersRepo.findOne({
      where: { emailVerificationToken: token },
    });
    if (!user || user.userType !== UserType.CLIENT) {
      throw new BadRequestException(
        'This link is invalid or no longer active. If you already verified your email, try signing in.',
      );
    }
    if (user.emailVerifiedAt) {
      return { ok: true as const, alreadyVerified: true };
    }
    if (
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'This verification link has expired. Use “Resend verification email” on the sign-in page.',
      );
    }
    user.emailVerifiedAt = new Date();
    await this.usersRepo.save(user);
    return { ok: true as const, alreadyVerified: false };
  }

  async resendClientVerification(dto: ResendClientVerificationDto) {
    if (!this.mail.isConfigured()) {
      throw new BadRequestException(
        'Email is not configured on this server. Contact support.',
      );
    }
    const username = dto.email.trim().toLowerCase();
    const user = await this.usersRepo.findOne({ where: { username } });
    if (
      !user ||
      user.userType !== UserType.CLIENT ||
      user.emailVerifiedAt
    ) {
      return { ok: true as const };
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date();
    verificationExpires.setHours(
      verificationExpires.getHours() + CLIENT_VERIFICATION_HOURS,
    );
    user.emailVerificationToken = rawToken;
    user.emailVerificationExpiresAt = verificationExpires;
    await this.usersRepo.save(user);
    const cli = await this.clientsRepo.findOne({
      where: { userId: user.id },
    });
    const firstName = cli?.firstName?.trim() || 'there';
    const origin = this.config
      .get<string>('FRONTEND_ORIGIN', 'http://localhost:5173')
      .replace(/\/$/, '');
    const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(rawToken)}`;
    try {
      await this.mail.sendClientEmailVerification({
        to: username,
        firstName,
        verifyUrl,
      });
    } catch (err) {
      this.logger.error('Resend verification email failed', err);
      throw new BadRequestException(
        'Could not send email. Try again later or contact support.',
      );
    }
    return { ok: true as const };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({
      where: { username: dto.username.trim() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    if (user.userType === UserType.CLIENT && !user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Please verify your email before signing in. Check your inbox or use “Resend verification email” below.',
      );
    }
    const payload = {
      sub: user.id,
      username: user.username,
      userType: user.userType,
      isAdmin: user.isAdmin,
    };
    const profile = await this.buildUserProfile(user);
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: profile,
    };
  }

  async registerEmployee(dto: RegisterEmployeeDto, actor: JwtUser) {
    const username = dto.username.trim();
    const existing = await this.usersRepo.findOne({ where: { username } });
    if (existing) {
      throw new ConflictException('Username already taken');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const hireDate = new Date(dto.hireDate);

    await this.usersRepo.manager.transaction(async (em) => {
      const user = em.create(User, {
        username,
        passwordHash,
        userType: UserType.EMPLOYEE,
        isAdmin: false,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        createdById: actor.userId,
        updatedById: actor.userId,
      });
      await em.save(user);
      const employee = em.create(Employee, {
        userId: user.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email.trim().toLowerCase(),
        contactNumber: dto.contactNumber.trim(),
        hireDate,
        position: dto.position.trim(),
        createdById: actor.userId,
        updatedById: actor.userId,
      });
      await em.save(employee);
    });

    const created = await this.usersRepo.findOneOrFail({ where: { username } });
    const employee = await this.employeesRepo.findOneOrFail({
      where: { userId: created.id },
    });
    return {
      id: created.id,
      username: created.username,
      userType: created.userType,
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
      },
    };
  }

  async me(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.buildUserProfile(user);
  }

  private async buildUserProfile(user: User) {
    const base = {
      id: user.id,
      username: user.username,
      userType: user.userType,
      isAdmin: user.isAdmin,
      employee: null as {
        id: string;
        firstName: string;
        lastName: string;
        position: string;
      } | null,
      client: null as {
        firstName: string;
        lastName: string;
        email: string;
        contactNumber: string;
        bankAccountNumber: string | null;
        bankAccountName: string | null;
        bankCode: string | null;
        bankBranch: string | null;
      } | null,
    };

    if (user.userType === UserType.EMPLOYEE) {
      const emp = await this.employeesRepo.findOne({
        where: { userId: user.id },
      });
      if (emp) {
        base.employee = {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          position: emp.position,
        };
      }
    }

    if (user.userType === UserType.CLIENT) {
      const cli = await this.clientsRepo.findOne({
        where: { userId: user.id },
      });
      if (cli) {
        base.client = {
          firstName: cli.firstName,
          lastName: cli.lastName,
          email: cli.email,
          contactNumber: cli.contactNumber,
          bankAccountNumber: cli.bankAccountNumber,
          bankAccountName: cli.bankAccountName,
          bankCode: cli.bankCode,
          bankBranch: cli.bankBranch,
        };
      }
    }

    return base;
  }
}
