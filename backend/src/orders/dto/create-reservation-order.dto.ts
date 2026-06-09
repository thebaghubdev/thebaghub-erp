import { IsUUID } from 'class-validator';

export class CreateReservationOrderDto {
  @IsUUID()
  inventoryItemId: string;
}
