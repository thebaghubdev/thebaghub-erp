import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

/** Client-safe read of consign form picklists (JWT required; not staff-only). */
@Controller('client/consignment-form')
export class ClientConsignmentFormController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('options')
  getOptions() {
    return this.settingsService.getConsignmentFormPicklists();
  }
}
