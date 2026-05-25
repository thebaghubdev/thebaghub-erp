import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { UpsertTablePreferenceDto } from './dto/upsert-table-preference.dto';
import { TablePreferencesService } from './table-preferences.service';

@Controller('table-preferences')
export class TablePreferencesController {
  constructor(
    private readonly tablePreferencesService: TablePreferencesService,
  ) {}

  @Get(':tableId')
  findOne(@Req() req: { user: JwtUser }, @Param('tableId') tableId: string) {
    return this.tablePreferencesService.findForUser(req.user.userId, tableId);
  }

  @Patch(':tableId')
  upsert(
    @Req() req: { user: JwtUser },
    @Param('tableId') tableId: string,
    @Body() dto: UpsertTablePreferenceDto,
  ) {
    return this.tablePreferencesService.upsertForUser(
      req.user.userId,
      tableId,
      dto,
    );
  }
}
