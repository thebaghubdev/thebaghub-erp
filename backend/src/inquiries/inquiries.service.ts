import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inquiry } from './entities/inquiry.entity';

@Injectable()
export class InquiriesService {
  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiriesRepo: Repository<Inquiry>,
  ) {}

  findAll(): Promise<Inquiry[]> {
    return this.inquiriesRepo.find({ order: { createdAt: 'DESC' } });
  }
}
