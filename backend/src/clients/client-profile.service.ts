import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateClientBankDto } from './dto/update-client-bank.dto';
import { Client } from './entities/client.entity';

function trimOrNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
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
  ): Promise<{
    firstName: string;
    lastName: string;
    email: string;
    contactNumber: string;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    bankCode: string | null;
    bankBranch: string | null;
  }> {
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

    await this.clientsRepo.save(client);

    return {
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      contactNumber: client.contactNumber,
      bankAccountNumber: client.bankAccountNumber,
      bankAccountName: client.bankAccountName,
      bankCode: client.bankCode,
      bankBranch: client.bankBranch,
    };
  }
}
