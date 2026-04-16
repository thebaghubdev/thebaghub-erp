import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Setting } from '../settings/entities/setting.entity';
import { User } from '../users/entities/user.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Employee, Setting, AuthenticationMetric]),
  ],
  providers: [SeedService],
})
export class DatabaseModule {}
