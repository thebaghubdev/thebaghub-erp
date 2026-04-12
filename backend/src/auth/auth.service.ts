import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { UserType } from '../enums/user-type.enum';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { JwtUser } from './jwt-user';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly jwtService: JwtService,
  ) {}

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
        firstName: string;
        lastName: string;
        position: string;
      } | null,
    };

    if (user.userType === UserType.EMPLOYEE) {
      const emp = await this.employeesRepo.findOne({
        where: { userId: user.id },
      });
      if (emp) {
        base.employee = {
          firstName: emp.firstName,
          lastName: emp.lastName,
          position: emp.position,
        };
      }
    }

    return base;
  }
}
