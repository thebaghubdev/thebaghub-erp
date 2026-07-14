import { IsIn, IsString } from 'class-validator';
import { CLIENT_VIP_STATUSES } from '../../clients/client-vip-status.util';

export class UpdateClientVipStatusDto {
  @IsString()
  @IsIn(CLIENT_VIP_STATUSES)
  vipStatus: (typeof CLIENT_VIP_STATUSES)[number];
}
