import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FeatureAccessService } from '../access-control/feature-access.service';
import { JwtUser } from '../auth/jwt-user';
import { Employee } from '../employees/entities/employee.entity';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import type { MulterFile } from '../inquiries/multer-file.type';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ReorderTasksDto } from './dto/reorder-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';
import {
  TASK_ATTACHMENT_MAX_COUNT,
  assertTaskAttachmentFiles,
  parseRetainedAttachmentKeys,
  taskAttachmentStorageKey,
  toTaskAttachmentUpload,
} from './task-attachment.util';
import { TASK_SEVERITY_LABELS } from './task.constants';

export type TaskAttachment = {
  key: string;
  url: string;
  contentType: string;
  filename: string | null;
};

export type TaskApiRow = {
  id: string;
  assigneeId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  severity: Task['severity'];
  progress: Task['progress'];
  sortOrder: number;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  canDelete: boolean;
  attachments: TaskAttachment[];
};

export type TaskAssigneeRow = {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly featureAccess: FeatureAccessService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
  ) {}

  async listForAssignee(
    user: JwtUser,
    assigneeId?: string,
  ): Promise<TaskApiRow[]> {
    const actor = await this.requireEmployee(user.userId);
    const targetId = assigneeId?.trim() || actor.id;
    await this.assertCanAccessBoard(user, actor, targetId);

    const rows = await this.tasksRepo.find({
      where: { assigneeId: targetId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return this.toApiRows(rows, user.userId);
  }

  async listAssignees(): Promise<TaskAssigneeRow[]> {
    const rows = await this.employeesRepo.find({
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
    return rows.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      position: e.position,
    }));
  }

  async create(user: JwtUser, dto: CreateTaskDto): Promise<TaskApiRow> {
    const actor = await this.requireEmployee(user.userId);
    const assigneeId = dto.assigneeId?.trim() || actor.id;
    await this.assertCanAccessBoard(user, actor, assigneeId);

    const assignee = await this.employeesRepo.findOne({
      where: { id: assigneeId },
    });
    if (!assignee) {
      throw new NotFoundException('Assignee not found');
    }

    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('Title is required');
    }
    const saved = await this.insertPendingTask({
      assigneeId,
      title,
      description: dto.description?.trim() || null,
      dueDate: dto.dueDate ?? null,
      severity: dto.severity,
      createdByUserId: user.userId,
    });

    if (assigneeId !== actor.id) {
      const severityLabel = TASK_SEVERITY_LABELS[saved.severity];
      const managerName = `${actor.firstName} ${actor.lastName}`.trim();
      void this.notifications
        .notify({
          message: `${managerName} assigned you a ${severityLabel} task: ${title}`,
          receiverId: assigneeId,
        })
        .catch((err: unknown) => {
          this.logger.error('Failed to notify assignee of new task', err);
        });
    }

    const [row] = await this.toApiRows([saved], user.userId);
    return row;
  }

  /** Create a task without board-access checks or a second assignee notification. */
  async createAssigned(input: {
    createdByUserId: string;
    assigneeId: string;
    title: string;
    description?: string | null;
    severity: Task['severity'];
    dueDate?: string | null;
  }): Promise<void> {
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException('Title is required');
    }
    await this.insertPendingTask({
      assigneeId: input.assigneeId,
      title,
      description: input.description?.trim() || null,
      dueDate: input.dueDate ?? null,
      severity: input.severity,
      createdByUserId: input.createdByUserId,
    });
  }

  async update(
    user: JwtUser,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskApiRow> {
    const actor = await this.requireEmployee(user.userId);
    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    await this.assertCanAccessBoard(user, actor, task.assigneeId);

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException('Title is required');
      }
      task.title = title;
    }
    if (dto.description !== undefined) {
      task.description = dto.description?.trim() || null;
    }
    if (dto.dueDate !== undefined) {
      task.dueDate = dto.dueDate;
    }
    if (dto.severity !== undefined) {
      task.severity = dto.severity;
    }
    if (dto.progress !== undefined) {
      task.progress = dto.progress;
    }
    if (dto.sortOrder !== undefined) {
      task.sortOrder = dto.sortOrder;
    }
    task.updatedById = user.userId;
    const saved = await this.tasksRepo.save(task);
    const [row] = await this.toApiRows([saved], user.userId);
    return row;
  }

  async reorder(user: JwtUser, dto: ReorderTasksDto): Promise<TaskApiRow[]> {
    const actor = await this.requireEmployee(user.userId);
    if (dto.items.length === 0) {
      return [];
    }

    const ids = dto.items.map((i) => i.id);
    const tasks = await this.tasksRepo.find({ where: { id: In(ids) } });
    if (tasks.length !== ids.length) {
      throw new NotFoundException('One or more tasks were not found');
    }

    const byId = new Map(tasks.map((t) => [t.id, t]));
    const assigneeIds = new Set(tasks.map((t) => t.assigneeId));
    for (const assigneeId of assigneeIds) {
      await this.assertCanAccessBoard(user, actor, assigneeId);
    }

    for (const item of dto.items) {
      const task = byId.get(item.id)!;
      task.progress = item.progress;
      task.sortOrder = item.sortOrder;
      task.updatedById = user.userId;
    }
    await this.tasksRepo.save(tasks);
    return this.toApiRows(
      tasks.sort((a, b) => a.sortOrder - b.sortOrder),
      user.userId,
    );
  }

  async remove(user: JwtUser, id: string): Promise<void> {
    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (task.createdById !== user.userId) {
      throw new ForbiddenException('Only the creator can delete this task');
    }
    await this.media.deleteByOwner(
      MediaOwnerType.TASK,
      task.id,
      MediaPurpose.TASK_ATTACHMENT,
    );
    await this.tasksRepo.remove(task);
  }

  async replaceAttachments(
    user: JwtUser,
    id: string,
    retainedKeysRaw: string | undefined,
    files: MulterFile[],
  ): Promise<TaskApiRow> {
    const actor = await this.requireEmployee(user.userId);
    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    await this.assertCanAccessBoard(user, actor, task.assigneeId);

    const uploadFiles = (files ?? []).map(toTaskAttachmentUpload);
    try {
      assertTaskAttachmentFiles(uploadFiles);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Unsupported attachment',
      );
    }
    const retainedKeys = parseRetainedAttachmentKeys(retainedKeysRaw);
    if (retainedKeys.length + uploadFiles.length > TASK_ATTACHMENT_MAX_COUNT) {
      throw new BadRequestException(
        `At most ${TASK_ATTACHMENT_MAX_COUNT} attachments are allowed`,
      );
    }

    try {
      await this.media.replaceGallery(
        MediaOwnerType.TASK,
        task.id,
        MediaPurpose.TASK_ATTACHMENT,
        retainedKeys,
        uploadFiles,
        (_index, file) => taskAttachmentStorageKey(task.id, file),
        { uploadedByUserId: user.userId, createdById: user.userId },
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not save attachments';
      if (message.startsWith('Unknown image key:')) {
        throw new BadRequestException(message);
      }
      throw err;
    }

    task.updatedById = user.userId;
    const saved = await this.tasksRepo.save(task);
    const [row] = await this.toApiRows([saved], user.userId);
    return row;
  }

  private async insertPendingTask(input: {
    assigneeId: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    severity: Task['severity'];
    createdByUserId: string;
  }): Promise<Task> {
    const maxOrder = await this.tasksRepo
      .createQueryBuilder('t')
      .select('MAX(t.sort_order)', 'max')
      .where('t.assignee_id = :assigneeId', { assigneeId: input.assigneeId })
      .andWhere('t.progress = :progress', { progress: 'pending' })
      .getRawOne<{ max: string | null }>();
    const sortOrder = (maxOrder?.max != null ? Number(maxOrder.max) : -1) + 1;
    const task = this.tasksRepo.create({
      assigneeId: input.assigneeId,
      title: input.title.slice(0, 200),
      description: input.description,
      dueDate: input.dueDate,
      severity: input.severity,
      progress: 'pending',
      sortOrder,
      createdById: input.createdByUserId,
      updatedById: input.createdByUserId,
    });
    return this.tasksRepo.save(task);
  }

  private async requireEmployee(userId: string): Promise<Employee> {
    const employee = await this.employeesRepo.findOne({ where: { userId } });
    if (!employee) {
      throw new ForbiddenException('Employee profile not found');
    }
    return employee;
  }

  private async assertCanAccessBoard(
    user: JwtUser,
    actor: Employee,
    assigneeId: string,
  ): Promise<void> {
    if (actor.id === assigneeId) {
      return;
    }
    await this.featureAccess.assertAccess(
      user.userId,
      user.isAdmin,
      'task-management',
      'edit',
    );
  }

  private async toApiRows(
    tasks: Task[],
    actorUserId: string,
  ): Promise<TaskApiRow[]> {
    const creatorUserIds = [
      ...new Set(
        tasks
          .map((t) => t.createdById)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    const creators =
      creatorUserIds.length > 0
        ? await this.employeesRepo.find({
            where: { userId: In(creatorUserIds) },
          })
        : [];
    const nameByUserId = new Map(
      creators.map((e) => [e.userId, `${e.firstName} ${e.lastName}`.trim()]),
    );

    const mediaRows = await this.media.findByOwners(
      MediaOwnerType.TASK,
      tasks.map((t) => t.id),
      { purpose: MediaPurpose.TASK_ATTACHMENT, orderBySort: true },
    );
    const attachmentsByTaskId = new Map<string, TaskAttachment[]>();
    for (const row of mediaRows) {
      const list = attachmentsByTaskId.get(row.ownerId) ?? [];
      list.push({
        key: row.storageKey,
        url: this.media.resolveUrl(row),
        contentType: row.contentType,
        filename: row.originalFilename,
      });
      attachmentsByTaskId.set(row.ownerId, list);
    }

    return tasks.map((t) => ({
      id: t.id,
      assigneeId: t.assigneeId,
      title: t.title,
      description: t.description,
      dueDate: this.formatDateOnly(t.dueDate),
      severity: t.severity,
      progress: t.progress,
      sortOrder: t.sortOrder,
      createdAt: t.createdAt.toISOString(),
      createdById: t.createdById,
      createdByName: t.createdById
        ? (nameByUserId.get(t.createdById) ?? null)
        : null,
      canDelete: t.createdById === actorUserId,
      attachments: attachmentsByTaskId.get(t.id) ?? [],
    }));
  }

  private formatDateOnly(value: string | Date | null): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
