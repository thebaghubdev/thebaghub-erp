import { IsUUID } from 'class-validator';
import { OrderPickupFieldsDto } from './order-pickup-fields.dto';

export class CreateReservationOrderDto extends OrderPickupFieldsDto {
  @IsUUID()
  inventoryItemId: string;
}
