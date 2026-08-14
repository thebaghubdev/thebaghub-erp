import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { CreateAuthenticationMetricDto } from './dto/create-authentication-metric.dto';
import { SoftDeleteAuthenticationMetricsDto } from './dto/soft-delete-authentication-metrics.dto';
import { AuthenticationMetricsService } from './authentication-metrics.service';

@Controller('authentication-metrics')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class AuthenticationMetricsController {
  constructor(
    private readonly authenticationMetricsService: AuthenticationMetricsService,
  ) {}

  @Get()
  findAll() {
    return this.authenticationMetricsService.findAll();
  }

  @Post('soft-delete')
  @RequireFeature('authentication', 'edit')
  @HttpCode(HttpStatus.OK)
  softDelete(@Body() body: SoftDeleteAuthenticationMetricsDto) {
    return this.authenticationMetricsService.softDeleteByIds(body.ids);
  }

  @Post()
  @RequireFeature('authentication', 'edit')
  create(@Body() dto: CreateAuthenticationMetricDto) {
    return this.authenticationMetricsService.create(dto);
  }
}
