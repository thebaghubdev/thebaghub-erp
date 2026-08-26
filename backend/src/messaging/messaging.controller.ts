import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { AddConversationMembersDto } from './dto/add-conversation-members.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { MessagingService } from './messaging.service';

@Controller('messaging')
@UseGuards(StaffOnlyGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('token')
  getToken(@Req() req: { user: JwtUser }) {
    return this.messaging.getToken(req.user.userId);
  }

  @Get('employees')
  listEmployees(@Req() req: { user: JwtUser }) {
    return this.messaging.listEmployees(req.user.userId);
  }

  @Post('conversations')
  createConversation(
    @Req() req: { user: JwtUser },
    @Body() dto: CreateConversationDto,
  ) {
    return this.messaging.createConversation(req.user.userId, dto);
  }

  @Post('conversations/:channelId/members')
  addConversationMembers(
    @Req() req: { user: JwtUser },
    @Param('channelId') channelId: string,
    @Body() dto: AddConversationMembersDto,
  ) {
    return this.messaging.addConversationMembers(
      req.user.userId,
      channelId,
      dto,
    );
  }
}
