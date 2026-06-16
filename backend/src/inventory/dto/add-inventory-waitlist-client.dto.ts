import { IsUUID } from 'class-validator';

export class AddInventoryWaitlistClientDto {
  @IsUUID()
  clientId: string;
}
