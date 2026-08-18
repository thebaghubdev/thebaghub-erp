import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const CONVERSATION_KINDS = ['direct', 'group'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export class CreateConversationDto {
  @IsIn(CONVERSATION_KINDS)
  kind: ConversationKind;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  memberUserIds: string[];

  @ValidateIf((o: CreateConversationDto) => o.kind === 'group')
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;
}
