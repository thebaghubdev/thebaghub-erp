import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.settingsService.findOneByKey(key);
  }

  @Patch(':key')
  @RequireFeature('settings', 'edit')
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settingsService.updateByKey(key, dto);
  }
}
