import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthenticationMetricsController } from './authentication-metrics.controller';
import { AuthenticationMetricsService } from './authentication-metrics.service';
import { AuthenticationMetric } from './entities/authentication-metric.entity';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([AuthenticationMetric]),
  ],
  controllers: [AuthenticationMetricsController],
  providers: [AuthenticationMetricsService],
})
export class AuthenticationMetricsModule {}
