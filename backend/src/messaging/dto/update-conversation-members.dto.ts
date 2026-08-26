import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class UpdateConversationMembersDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  addUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  removeUserIds?: string[];
}
