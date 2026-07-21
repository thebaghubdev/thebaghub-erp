import { IsUUID } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

export class CreateStaffOrderDto extends CreateOrderDto {
  @IsUUID()
  customerId: string;
}
