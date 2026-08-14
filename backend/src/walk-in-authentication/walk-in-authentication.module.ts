import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { Employee } from '../employees/entities/employee.entity';
import { MediaModule } from '../media/media.module';
import { WalkInAuthenticationMetric } from './entities/walk-in-authentication-metric.entity';
import { WalkInAuthentication } from './entities/walk-in-authentication.entity';
import { WalkInAuthenticationController } from './walk-in-authentication.controller';
import { WalkInAuthenticationService } from './walk-in-authentication.service';

@Module({
  imports: [
    AccessControlModule,
    MediaModule,
    TypeOrmModule.forFeature([
      WalkInAuthentication,
      WalkInAuthenticationMetric,
      Employee,
    ]),
  ],
  controllers: [WalkInAuthenticationController],
  providers: [WalkInAuthenticationService],
  exports: [WalkInAuthenticationService],
})
export class WalkInAuthenticationModule {}
