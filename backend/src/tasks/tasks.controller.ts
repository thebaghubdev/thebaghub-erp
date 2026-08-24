import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import type { MulterFile } from '../inquiries/multer-file.type';
import { CreateTaskDto } from './dto/create-task.dto';
import { ReorderTasksDto } from './dto/reorder-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TASK_ATTACHMENT_MAX_BYTES, TASK_ATTACHMENT_MAX_COUNT } from './task-attachment.util';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('assignees')
  @RequireFeature('task-management', 'edit')
  listAssignees() {
    return this.tasksService.listAssignees();
  }

  @Get()
  list(
    @Req() req: { user: JwtUser },
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.tasksService.listForAssignee(req.user, assigneeId);
  }

  @Post()
  create(@Req() req: { user: JwtUser }, @Body() body: CreateTaskDto) {
    return this.tasksService.create(req.user, body);
  }

  @Patch('reorder')
  reorder(@Req() req: { user: JwtUser }, @Body() body: ReorderTasksDto) {
    return this.tasksService.reorder(req.user, body);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', TASK_ATTACHMENT_MAX_COUNT, {
      limits: { fileSize: TASK_ATTACHMENT_MAX_BYTES },
    }),
  )
  replaceAttachments(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('retainedKeys') retainedKeys: string | undefined,
    @UploadedFiles() files: MulterFile[],
  ) {
    return this.tasksService.replaceAttachments(
      req.user,
      id,
      retainedKeys,
      files ?? [],
    );
  }

  @Patch(':id')
  update(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.update(req.user, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.remove(req.user, id);
  }
}
