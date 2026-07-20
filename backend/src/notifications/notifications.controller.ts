import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Req() req: { user: JwtUser }, @Query('take') takeRaw?: string) {
    const employeeId = await this.notifications.requireEmployeeIdForUser(
      req.user.userId,
    );
    const take = takeRaw != null ? Number(takeRaw) : 80;
    return this.notifications.listForReceiver(employeeId, take);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: { user: JwtUser }) {
    const employeeId = await this.notifications.requireEmployeeIdForUser(
      req.user.userId,
    );
    return {
      count: await this.notifications.unreadCountForReceiver(employeeId),
    };
  }

  @Patch(':id/read')
  async markRead(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const employeeId = await this.notifications.requireEmployeeIdForUser(
      req.user.userId,
    );
    return this.notifications.markRead(employeeId, id);
  }

  @Post('read-all')
  async markAllRead(@Req() req: { user: JwtUser }) {
    const employeeId = await this.notifications.requireEmployeeIdForUser(
      req.user.userId,
    );
    return this.notifications.markAllRead(employeeId);
  }

  @Delete()
  async clearAll(@Req() req: { user: JwtUser }) {
    const employeeId = await this.notifications.requireEmployeeIdForUser(
      req.user.userId,
    );
    return this.notifications.deleteAllForReceiver(employeeId);
  }
}
