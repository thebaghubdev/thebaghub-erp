import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { StreamChat } from 'stream-chat';
import type { Channel, ChannelFilters, UserResponse } from 'stream-chat';
import { In, Not, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { AddConversationMembersDto } from './dto/add-conversation-members.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';

export type MessagingEmployeeOption = {
  userId: string;
  firstName: string;
  lastName: string;
  position: string;
};

export type MessagingTokenResponse = {
  apiKey: string;
  token: string;
  userId: string;
  name: string;
};

export type MessagingChannelRef = {
  channelType: string;
  channelId: string;
  cid: string;
};

@Injectable()
export class MessagingService {
  private client: StreamChat | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) {}

  async getToken(userId: string): Promise<MessagingTokenResponse> {
    const employee = await this.requireEmployee(userId);
    const stream = this.getClient();
    const name = this.displayName(employee);
    try {
      await stream.upsertUsers([this.toStreamUser(employee)]);
    } catch (err) {
      this.throwStreamError(err);
    }
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    return {
      apiKey: this.requireApiKey(),
      token: stream.createToken(userId, exp),
      userId,
      name,
    };
  }

  async listEmployees(userId: string): Promise<{
    employees: MessagingEmployeeOption[];
    withoutDirectMessage: MessagingEmployeeOption[];
  }> {
    await this.requireEmployee(userId);
    const rows = await this.employeesRepo.find({
      where: { userId: Not(userId), user: { isAdmin: false } },
      relations: ['user'],
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
    const employees = rows.map((e) => this.toOption(e));
    const partnerIds = await this.getDirectMessagePartnerIds(userId);
    return {
      employees,
      withoutDirectMessage: employees.filter((e) => !partnerIds.has(e.userId)),
    };
  }

  async createConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<MessagingChannelRef> {
    await this.requireEmployee(userId);
    const memberIds = [...new Set(dto.memberUserIds.filter((id) => id !== userId))];
    if (memberIds.length === 0) {
      throw new BadRequestException('Select at least one employee');
    }

    if (dto.kind === 'direct' && memberIds.length !== 1) {
      throw new BadRequestException(
        'Direct messages must include exactly one other employee',
      );
    }

    const members = await this.employeesRepo.find({
      where: { userId: In(memberIds) },
      relations: ['user'],
    });
    if (members.length !== memberIds.length) {
      throw new BadRequestException('One or more employees were not found');
    }
    if (members.some((e) => e.user?.isAdmin)) {
      throw new BadRequestException(
        'Administrator accounts cannot be added to conversations',
      );
    }

    const creator = await this.requireEmployee(userId);
    const stream = this.getClient();
    try {
      await stream.upsertUsers([
        this.toStreamUser(creator),
        ...members.map((e) => this.toStreamUser(e)),
      ]);
    } catch (err) {
      this.throwStreamError(err);
    }

    if (dto.kind === 'direct') {
      return this.createDirectChannel(stream, userId, memberIds[0]);
    }

    const name = dto.name?.trim() ?? '';
    if (!name) {
      throw new BadRequestException('Group name is required');
    }
    return this.createGroupChannel(stream, userId, memberIds, name);
  }

  async addConversationMembers(
    userId: string,
    channelId: string,
    dto: AddConversationMembersDto,
  ): Promise<MessagingChannelRef> {
    const actor = await this.requireEmployee(userId);
    const id = channelId.trim();
    if (!id) {
      throw new NotFoundException('Conversation not found');
    }

    const stream = this.getClient();
    const existing = await this.queryChannelsOrThrow(stream, {
      type: 'messaging',
      id,
    });
    const channel = existing[0];
    if (!channel) {
      throw new NotFoundException('Conversation not found');
    }
    if (channel.data?.kind !== 'group') {
      throw new BadRequestException(
        'Staff can only be added to group conversations',
      );
    }
    const currentMemberIds = new Set(
      Object.keys(channel.state.members ?? {}),
    );
    if (!currentMemberIds.has(userId)) {
      throw new ForbiddenException(
        'Only members of this conversation can add staff',
      );
    }

    const memberIds = [
      ...new Set(
        dto.memberUserIds.filter(
          (memberId) =>
            memberId !== userId && !currentMemberIds.has(memberId),
        ),
      ),
    ];
    if (memberIds.length === 0) {
      throw new BadRequestException(
        'Select at least one employee who is not already in this conversation',
      );
    }

    const members = await this.employeesRepo.find({
      where: { userId: In(memberIds) },
      relations: ['user'],
    });
    if (members.length !== memberIds.length) {
      throw new BadRequestException('One or more employees were not found');
    }
    if (members.some((e) => e.user?.isAdmin)) {
      throw new BadRequestException(
        'Administrator accounts cannot be added to conversations',
      );
    }

    try {
      await stream.upsertUsers(members.map((e) => this.toStreamUser(e)));
    } catch (err) {
      this.throwStreamError(err);
    }

    const addedNames = members.map((e) => this.displayName(e)).join(', ');
    try {
      await channel.addMembers(memberIds, {
        text: `${this.displayName(actor)} added ${addedNames} to the group.`,
        user_id: userId,
      });
    } catch (err) {
      this.throwStreamError(err);
    }
    return this.toChannelRef(channel);
  }

  private async createDirectChannel(
    stream: StreamChat,
    currentUserId: string,
    otherUserId: string,
  ): Promise<MessagingChannelRef> {
    const existing = await this.queryChannelsOrThrow(stream, {
      type: 'messaging',
      kind: 'direct',
      members: { $eq: [currentUserId, otherUserId] },
    });
    if (existing[0]) {
      return this.toChannelRef(existing[0]);
    }

    const channel = stream.channel('messaging', {
      members: [currentUserId, otherUserId],
      created_by_id: currentUserId,
      kind: 'direct',
    });
    try {
      await channel.create();
    } catch (err) {
      this.throwStreamError(err);
    }
    return this.toChannelRef(channel);
  }

  private async createGroupChannel(
    stream: StreamChat,
    currentUserId: string,
    memberIds: string[],
    name: string,
  ): Promise<MessagingChannelRef> {
    const channelId = `grp_${randomUUID().replace(/-/g, '')}`;
    const channel = stream.channel('messaging', channelId, {
      name,
      kind: 'group',
      members: [currentUserId, ...memberIds],
      created_by_id: currentUserId,
    });
    try {
      await channel.create();
    } catch (err) {
      this.throwStreamError(err);
    }
    return this.toChannelRef(channel);
  }

  private async getDirectMessagePartnerIds(
    userId: string,
  ): Promise<Set<string>> {
    const stream = this.getClient();
    const partners = new Set<string>();
    let offset = 0;
    const limit = 30;
    for (;;) {
      const channels = await this.queryChannelsOrThrow(
        stream,
        {
          type: 'messaging',
          kind: 'direct',
          members: { $in: [userId] },
        },
        offset,
        limit,
      );
      for (const channel of channels) {
        const memberIds = Object.keys(channel.state.members ?? {});
        if (memberIds.length !== 2) continue;
        for (const id of memberIds) {
          if (id !== userId) partners.add(id);
        }
      }
      if (channels.length < limit) break;
      offset += limit;
      if (offset > 300) break;
    }
    return partners;
  }

  private toChannelRef(channel: Channel): MessagingChannelRef {
    const channelId =
      channel.id ??
      (channel.cid.includes(':') ? channel.cid.split(':')[1] : channel.cid);
    if (!channelId) {
      throw new ServiceUnavailableException('Could not create conversation');
    }
    return {
      channelType: channel.type,
      channelId,
      cid: channel.cid,
    };
  }

  private async requireEmployee(userId: string): Promise<Employee> {
    const employee = await this.employeesRepo.findOne({ where: { userId } });
    if (!employee) {
      throw new ForbiddenException('Employee profile required');
    }
    return employee;
  }

  private toOption(employee: Employee): MessagingEmployeeOption {
    return {
      userId: employee.userId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
    };
  }

  private toStreamUser(employee: Employee): UserResponse {
    return {
      id: employee.userId,
      name: this.displayName(employee),
      role: 'user',
    };
  }

  private displayName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  private getClient(): StreamChat {
    if (this.client) return this.client;
    const apiKey = this.requireApiKey();
    const apiSecret = this.config.get<string>('STREAM_API_SECRET')?.trim();
    if (!apiSecret) {
      throw new ServiceUnavailableException('Messaging is not configured');
    }
    this.client = StreamChat.getInstance(apiKey, apiSecret);
    return this.client;
  }

  private async queryChannelsOrThrow(
    stream: StreamChat,
    filter: ChannelFilters,
    offset = 0,
    limit = 1,
  ): Promise<Channel[]> {
    try {
      return await stream.queryChannels(
        filter,
        { created_at: -1 },
        { limit, offset, state: true },
      );
    } catch (err) {
      this.throwStreamError(err);
    }
  }

  private throwStreamError(err: unknown): never {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : 'Could not complete messaging request';
    throw new ServiceUnavailableException(message);
  }

  private requireApiKey(): string {
    const apiKey = this.config.get<string>('STREAM_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Messaging is not configured');
    }
    return apiKey;
  }
}
