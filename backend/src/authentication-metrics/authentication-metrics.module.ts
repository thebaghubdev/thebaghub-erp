import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthenticationMetricsController } from './authentication-metrics.controller';
import { AuthenticationMetricsService } from './authentication-metrics.service';
import { AuthenticationMetric } from './entities/authentication-metric.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuthenticationMetric])],
  controllers: [AuthenticationMetricsController],
  providers: [AuthenticationMetricsService],
})
export class AuthenticationMetricsModule {}
