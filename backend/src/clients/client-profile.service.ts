import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CLIENT_PAYMENT_PREFERENCE_LOCKED_MESSAGE,
  hasCompleteBankDetails,
  isClientPaymentPreferenceLocked,
  touchesBankFields,
  touchesPaymentFields,
} from './client-payment-preference.util';
import { SaveConsignmentFormSnapshotDto } from './dto/save-consignment-form-snapshot.dto';
import { UpdateClientBankDto } from './dto/update-client-bank.dto';
import { Client } from './entities/client.entity';
import { normalizeClientVipStatus } from './client-vip-status.util';

function trimOrNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export type ClientProfileView = {
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  completeAddress: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  bankCode: string | null;
  preferredPaymentMethod:
    | 'check_pickup'
    | 'cash_pickup'
    | 'direct_deposit'
    | null;
  preferredPaymentBranch: 'pasig' | 'makati' | null;
  vipStatus: 'Regular' | 'Gold' | 'Diamond';
  totalConsignments: number;
  totalPurchases: number;
};

function mapClientProfileView(client: Client): ClientProfileView {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    contactNumber: client.contactNumber,
    completeAddress: client.completeAddress,
    bankAccountNumber: client.bankAccountNumber,
    bankAccountName: client.bankAccountName,
    bankCode: client.bankCode,
    preferredPaymentMethod: client.preferredPaymentMethod,
    preferredPaymentBranch: client.preferredPaymentBranch,
    vipStatus: normalizeClientVipStatus(client.vipStatus),
    totalConsignments: client.totalConsignments ?? 0,
    totalPurchases: client.totalPurchases ?? 0,
  };
}

@Injectable()
export class ClientProfileService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
  ) {}

  async updateBankDetails(
    userId: string,
    dto: UpdateClientBankDto,
  ): Promise<ClientProfileView> {
    const client = await this.clientsRepo.findOne({ where: { userId } });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const locked = isClientPaymentPreferenceLocked(client);
    if (
      locked &&
      (touchesBankFields(dto) || touchesPaymentFields(dto))
    ) {
      throw new BadRequestException(CLIENT_PAYMENT_PREFERENCE_LOCKED_MESSAGE);
    }

    if (touchesBankFields(dto)) {
      const missing =
        dto.bankAccountNumber === undefined ||
        dto.bankAccountName === undefined ||
        dto.bankCode === undefined;
      if (missing) {
        throw new BadRequestException(
          'All bank fields are required: bank, account number, and account name',
        );
      }
      const bankCode = dto.bankCode?.trim() ?? '';
      if (bankCode !== 'bdo' && bankCode !== 'bpi' && bankCode !== 'other') {
        throw new BadRequestException('Bank is required');
      }
      if (!trimOrNull(dto.bankAccountNumber)) {
        throw new BadRequestException('Account number is required');
      }
      if (!trimOrNull(dto.bankAccountName)) {
        throw new BadRequestException('Account name is required');
      }
    }

    if (dto.bankAccountNumber !== undefined) {
      client.bankAccountNumber = trimOrNull(dto.bankAccountNumber);
    }
    if (dto.bankAccountName !== undefined) {
      client.bankAccountName = trimOrNull(dto.bankAccountName);
    }
    if (dto.bankCode !== undefined) {
      const t = dto.bankCode.trim();
      client.bankCode = t === '' ? null : t;
    }
    if (dto.completeAddress !== undefined) {
      client.completeAddress = trimOrNull(dto.completeAddress);
    }

    if (dto.preferredPaymentMethod !== undefined) {
      if (dto.preferredPaymentMethod === 'direct_deposit') {
        if (!hasCompleteBankDetails(client)) {
          throw new BadRequestException(
            'Complete your bank details before selecting direct deposit',
          );
        }
        client.preferredPaymentBranch = null;
      } else if (dto.preferredPaymentBranch !== undefined) {
        client.preferredPaymentBranch = dto.preferredPaymentBranch;
      } else if (client.preferredPaymentBranch == null) {
        throw new BadRequestException(
          'Payment pickup branch is required for check or cash pickup',
        );
      }
      client.preferredPaymentMethod = dto.preferredPaymentMethod;
    } else if (dto.preferredPaymentBranch !== undefined) {
      if (client.preferredPaymentMethod === 'direct_deposit') {
        client.preferredPaymentBranch = null;
      } else {
        client.preferredPaymentBranch = dto.preferredPaymentBranch;
      }
    }

    await this.clientsRepo.save(client);

    return mapClientProfileView(client);
  }

  async getConsignmentFormSnapshot(userId: string): Promise<{
    snapshot: Record<string, unknown> | null;
  }> {
    const client = await this.clientsRepo.findOne({ where: { userId } });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    return { snapshot: client.consignmentFormSnapshot };
  }

  async saveConsignmentFormSnapshot(
    userId: string,
    dto: SaveConsignmentFormSnapshotDto,
  ): Promise<{ ok: true }> {
    const client = await this.clientsRepo.findOne({ where: { userId } });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    client.consignmentFormSnapshot = dto.snapshot;
    await this.clientsRepo.save(client);
    return { ok: true };
  }
}
