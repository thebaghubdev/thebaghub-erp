import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SaveConsignmentFormSnapshotDto } from './dto/save-consignment-form-snapshot.dto';
import { UpdateClientBankDto } from './dto/update-client-bank.dto';
import { Client } from './entities/client.entity';

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
  bankBranch: string | null;
  preferredPaymentMethod:
    | 'check_pickup'
    | 'cash_pickup'
    | 'direct_deposit'
    | null;
  preferredPaymentBranch: 'pasig' | 'makati' | null;
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
    bankBranch: client.bankBranch,
    preferredPaymentMethod: client.preferredPaymentMethod,
    preferredPaymentBranch: client.preferredPaymentBranch,
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
    if (dto.bankBranch !== undefined) {
      client.bankBranch = trimOrNull(dto.bankBranch);
    }
    if (dto.completeAddress !== undefined) {
      client.completeAddress = trimOrNull(dto.completeAddress);
    }

    if (dto.preferredPaymentMethod !== undefined) {
      client.preferredPaymentMethod = dto.preferredPaymentMethod;
      if (dto.preferredPaymentMethod === 'direct_deposit') {
        client.preferredPaymentBranch = null;
      } else if (dto.preferredPaymentBranch !== undefined) {
        client.preferredPaymentBranch = dto.preferredPaymentBranch;
      } else if (client.preferredPaymentBranch == null) {
        throw new BadRequestException(
          'Payment pickup branch is required for check or cash pickup',
        );
      }
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
